import type {
  WeatherProvider,
  WeatherRequest,
} from "@weather/provider-core";
import type {
  DailyWeatherPoint,
  ResolvedLocation,
  WeatherConditionCode,
} from "@weather/weather-domain";
import { z } from "zod";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

const PeriodSchema = z.object({
  summary: z.object({ symbol_code: z.string().optional() }).optional(),
  details: z
    .object({
      air_temperature_max: z.number().optional(),
      air_temperature_min: z.number().optional(),
      precipitation_amount: z.number().optional(),
      probability_of_precipitation: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

const TimeseriesPointSchema = z.object({
  time: z.iso.datetime({ offset: true }),
  data: z.object({
    instant: z.object({
      details: z.object({
        air_temperature: z.number(),
        relative_humidity: z.number().min(0).max(100).optional(),
        ultraviolet_index_clear_sky: z.number().min(0).optional(),
        wind_from_direction: z.number().min(0).max(360).optional(),
        wind_speed: z.number().min(0).optional(),
      }),
    }),
    next_1_hours: PeriodSchema.optional(),
    next_6_hours: PeriodSchema.optional(),
    next_12_hours: PeriodSchema.optional(),
  }),
});

const MetNorwayForecastSchema = z.object({
  properties: z.object({
    meta: z.object({
      updated_at: z.iso.datetime({ offset: true }),
    }),
    timeseries: z.array(TimeseriesPointSchema).min(1),
  }),
});

type TimeseriesPoint = z.infer<typeof TimeseriesPointSchema>;
type Period = z.infer<typeof PeriodSchema>;

function conditionFor(symbolCode?: string): WeatherConditionCode {
  const code = (symbolCode ?? "")
    .replace(/_(day|night|polartwilight)$/, "")
    .toLowerCase();
  if (code.includes("thunder")) return "thunderstorm";
  if (code.includes("hail")) return "hail";
  if (code.includes("sleet")) return "sleet";
  if (code.includes("snow")) return "snow";
  if (code.includes("rain")) return "rain";
  if (code.includes("fog")) return "fog";
  if (code === "cloudy") return "cloudy";
  if (code === "partlycloudy") return "partly_cloudy";
  if (code === "fair") return "mostly_clear";
  if (code === "clearsky") return "clear";
  return "unknown";
}

function preferredPeriod(point: TimeseriesPoint): Period | undefined {
  return (
    point.data.next_1_hours ??
    point.data.next_6_hours ??
    point.data.next_12_hours
  );
}

function periodHours(point: TimeseriesPoint): number | undefined {
  if (point.data.next_1_hours !== undefined) return 1;
  if (point.data.next_6_hours !== undefined) return 6;
  if (point.data.next_12_hours !== undefined) return 12;
  return undefined;
}

function httpDateAsInstant(value: string | null): string | undefined {
  if (value === null) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function expiryFor(response: Response, fetchedAt: Date): Date {
  const expires = response.headers.get("expires");
  const timestamp = expires === null ? Number.NaN : Date.parse(expires);
  return Number.isFinite(timestamp) && timestamp > fetchedAt.getTime()
    ? new Date(timestamp)
    : new Date(fetchedAt.getTime() + 30 * 60_000);
}

function localParts(
  instant: string | number,
  timezone: string,
): { date: string; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

interface DailyAccumulator {
  temperatures: number[];
  uvIndices: number[];
  condition?: { value: WeatherConditionCode; noonDistance: number };
}

function derivedDailyForecast(
  timeseries: readonly TimeseriesPoint[],
  timezone: string,
): DailyWeatherPoint[] {
  const days = new Map<string, DailyAccumulator>();

  for (const point of timeseries) {
    const local = localParts(point.time, timezone);
    const day = days.get(local.date) ?? {
      temperatures: [],
      uvIndices: [],
    };
    day.temperatures.push(point.data.instant.details.air_temperature);
    const uvIndex = point.data.instant.details.ultraviolet_index_clear_sky;
    if (uvIndex !== undefined) day.uvIndices.push(uvIndex);

    const condition = conditionFor(preferredPeriod(point)?.summary?.symbol_code);
    const noonDistance = Math.abs(local.hour - 12);
    if (
      condition !== "unknown" &&
      (day.condition === undefined ||
        noonDistance < day.condition.noonDistance)
    ) {
      day.condition = { value: condition, noonDistance };
    }

    for (const [hours, period] of [
      [6, point.data.next_6_hours],
      [12, point.data.next_12_hours],
    ] as const) {
      if (period === undefined) continue;
      const periodEnd = Date.parse(point.time) + hours * 60 * 60_000 - 1;
      if (localParts(periodEnd, timezone).date !== local.date) continue;
      if (period.details?.air_temperature_min !== undefined) {
        day.temperatures.push(period.details.air_temperature_min);
      }
      if (period.details?.air_temperature_max !== undefined) {
        day.temperatures.push(period.details.air_temperature_max);
      }
    }

    days.set(local.date, day);
  }

  return [...days.entries()].slice(0, 7).map(([date, day]) => ({
    date,
    minimumTemperatureCelsius: Math.min(...day.temperatures),
    maximumTemperatureCelsius: Math.max(...day.temperatures),
    ...(day.uvIndices.length === 0
      ? {}
      : { maximumUvIndex: Math.max(...day.uvIndices) }),
    ...(day.condition === undefined ? {} : { condition: day.condition.value }),
  }));
}

export interface MetNorwayWeatherOptions {
  userAgent: string;
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
}

export class MetNorwayWeatherProvider implements WeatherProvider {
  readonly descriptor = {
    id: "met-norway",
    name: "MET Norway",
    capabilities: {
      current: true,
      hourly: true,
      daily: true,
      alerts: false,
      airQuality: false,
      pollen: false,
      historical: false,
    },
    locationRequirements: {
      coordinates: true,
      elevation: false,
      providerLocationKey: false,
    },
    attribution: {
      text: "Weather data by MET Norway",
      url: "https://api.met.no/",
    },
    dataProfile: {
      weatherSpatial: "grid",
      currentSource: "forecast",
      hourlyGranularity: "variable_interval",
      dailyGranularity: "derived",
      airQualityIntegration: "unavailable",
      airQualityCoverage: "unavailable",
    },
    featureProfile: {
      sunriseSunset: {
        availability: "available",
        source: "separate_api",
        integrated: false,
        detail: "Global Sunrise API; not connected yet.",
      },
      uv: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Clear-sky UV in the shorter-range forecast.",
      },
      visibility: {
        availability: "unavailable",
        source: "forecast",
        integrated: false,
        detail: "Fog fraction is available, but not visibility distance.",
      },
      airQuality: {
        availability: "limited",
        source: "separate_api",
        integrated: false,
        detail: "A separate Norway-only forecast product; not connected yet.",
      },
      pollen: {
        availability: "unavailable",
        source: "separate_api",
        integrated: false,
        detail: "No verified pollen product.",
      },
    },
  } as const;

  readonly #userAgent: string;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #now: () => Date;

  constructor(options: MetNorwayWeatherOptions) {
    this.#userAgent = options.userAgent.trim();
    if (
      this.#userAgent.length < 10 ||
      /example\.(com|org|net)|^(okhttp|dalvik|fhttp|java|node|undici)([/ ]|$)/i.test(
        this.#userAgent,
      )
    ) {
      throw new Error(
        "MET Norway requires an identifying User-Agent with contact information",
      );
    }
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl =
      options.baseUrl ??
      "https://api.met.no/weatherapi/locationforecast/2.0/complete";
    this.#now = options.now ?? (() => new Date());
  }

  async getWeather(location: ResolvedLocation, request: WeatherRequest) {
    const url = new URL(this.#baseUrl);
    url.searchParams.set("lat", String(location.coordinates.latitude));
    url.searchParams.set("lon", String(location.coordinates.longitude));
    if (location.coordinates.elevationMetres !== undefined) {
      url.searchParams.set(
        "altitude",
        String(Math.round(location.coordinates.elevationMetres)),
      );
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": this.#userAgent,
    };
    const lastModifiedAt = request.previous?.metadata.sourceLastModifiedAt;
    if (lastModifiedAt !== undefined) {
      headers["if-modified-since"] = new Date(lastModifiedAt).toUTCString();
    }

    const response = await this.#fetch(url, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    const fetchedAt = this.#now();
    const expiresAt = expiryFor(response, fetchedAt);
    const staleAfter = new Date(expiresAt.getTime() + 24 * 60 * 60_000);

    if (response.status === 304) {
      if (request.previous === undefined) {
        throw new Error("MET Norway returned 304 without a cached forecast");
      }
      return {
        ...request.previous,
        location,
        metadata: {
          ...request.previous.metadata,
          fetchedAt: fetchedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          staleAfter: staleAfter.toISOString(),
        },
      };
    }
    if (!response.ok) {
      throw new Error(`MET Norway forecast returned ${response.status}`);
    }

    const forecast = MetNorwayForecastSchema.parse(await response.json());
    const timeseries = forecast.properties.timeseries;
    const currentPoint = timeseries[0];
    if (currentPoint === undefined) {
      throw new Error("MET Norway forecast contained no timeseries");
    }
    const currentDetails = currentPoint.data.instant.details;
    const currentPeriod = preferredPeriod(currentPoint);
    const sourceLastModifiedAt = httpDateAsInstant(
      response.headers.get("last-modified"),
    );

    return {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: currentPoint.time,
        temperatureCelsius: currentDetails.air_temperature,
        ...(currentDetails.relative_humidity === undefined
          ? {}
          : { relativeHumidityPercent: currentDetails.relative_humidity }),
        ...(currentPeriod?.details?.probability_of_precipitation === undefined
          ? {}
          : {
              precipitationProbabilityPercent:
                currentPeriod.details.probability_of_precipitation,
            }),
        ...(currentDetails.wind_speed === undefined
          ? {}
          : { windSpeedMetresPerSecond: currentDetails.wind_speed }),
        ...(currentDetails.wind_from_direction === undefined
          ? {}
          : { windDirectionDegrees: currentDetails.wind_from_direction }),
        condition: conditionFor(currentPeriod?.summary?.symbol_code),
      },
      hourly: timeseries.slice(0, 24).map((point, index, hourlyPoints) => {
        const details = point.data.instant.details;
        const period = preferredPeriod(point);
        const nextPoint = hourlyPoints[index + 1];
        const inferredInterval =
          nextPoint === undefined
            ? periodHours(point)
            : (Date.parse(nextPoint.time) - Date.parse(point.time)) / 3_600_000;
        return {
          validAt: point.time,
          ...(inferredInterval === undefined || inferredInterval <= 0
            ? {}
            : { intervalMinutes: Math.round(inferredInterval * 60) }),
          temperatureCelsius: details.air_temperature,
          ...(period?.details?.probability_of_precipitation === undefined
            ? {}
            : {
                precipitationProbabilityPercent:
                  period.details.probability_of_precipitation,
              }),
          ...(details.ultraviolet_index_clear_sky === undefined
            ? {}
            : { uvIndex: details.ultraviolet_index_clear_sky }),
          condition: conditionFor(period?.summary?.symbol_code),
        };
      }),
      daily: derivedDailyForecast(timeseries, location.timezone),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        staleAfter: staleAfter.toISOString(),
        forecastGeneratedAt: forecast.properties.meta.updated_at,
        ...(sourceLastModifiedAt === undefined
          ? {}
          : { sourceLastModifiedAt }),
      },
    };
  }
}
