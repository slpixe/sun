import type {
  WeatherAirQualityBundle,
  WeatherProvider,
  WeatherRequest,
} from "@weather/provider-core";
import type {
  AirQualityCategory,
  AirQualityIndex,
  PollutantSet,
  ResolvedLocation,
  WeatherConditionCode,
} from "@weather/weather-domain";
import { z } from "zod";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

const WeatherValuesSchema = z.object({
  temperature: z.number(),
  temperatureApparent: z.number().optional(),
  humidity: z.number().min(0).max(100).optional(),
  precipitationProbability: z.number().min(0).max(100).optional(),
  windSpeed: z.number().min(0).optional(),
  windDirection: z.number().min(0).max(360).optional(),
  uvIndex: z.number().min(0).optional(),
  visibility: z.number().min(0).optional(),
  weatherCode: z.number().int(),
});

const IntervalSchema = z.object({
  time: z.iso.datetime({ offset: true }),
  values: WeatherValuesSchema,
});

const DailyIntervalSchema = z.object({
  time: z.iso.datetime({ offset: true }),
  values: z.object({
    temperatureMin: z.number(),
    temperatureMax: z.number(),
    sunriseTime: z.iso.datetime({ offset: true }).nullable().optional(),
    sunsetTime: z.iso.datetime({ offset: true }).nullable().optional(),
    uvIndexMax: z.number().min(0).optional(),
    weatherCodeMax: z.number().int(),
  }),
});

const ForecastSchema = z.object({
  timelines: z.object({
    minutely: z.array(IntervalSchema).optional(),
    hourly: z.array(IntervalSchema),
    daily: z.array(DailyIntervalSchema),
  }),
});

const TimelineValuesSchema = z.object({
  temperature: z.number().optional(),
  temperatureApparent: z.number().optional(),
  humidity: z.number().min(0).max(100).optional(),
  precipitationProbability: z.number().min(0).max(100).optional(),
  windSpeed: z.number().min(0).optional(),
  windDirection: z.number().min(0).max(360).optional(),
  uvIndex: z.number().min(0).optional(),
  visibility: z.number().min(0).optional(),
  weatherCode: z.number().int().optional(),
  temperatureMin: z.number().optional(),
  temperatureMax: z.number().optional(),
  sunriseTime: z.iso.datetime({ offset: true }).nullable().optional(),
  sunsetTime: z.iso.datetime({ offset: true }).nullable().optional(),
  uvIndexMax: z.number().min(0).optional(),
  weatherCodeMax: z.number().int().optional(),
  particulateMatter25: z.number().min(0).optional(),
  particulateMatter10: z.number().min(0).optional(),
  pollutantO3: z.number().min(0).optional(),
  pollutantNO2: z.number().min(0).optional(),
  pollutantCO: z.number().min(0).optional(),
  pollutantSO2: z.number().min(0).optional(),
  epaIndex: z.number().min(0).optional(),
  epaHealthConcern: z.number().int().min(0).max(5).optional(),
});

const TimelinesSchema = z.object({
  data: z.object({
    timelines: z.array(
      z.object({
        timestep: z.enum(["current", "1h", "1d"]),
        intervals: z.array(
          z.object({
            startTime: z.iso.datetime({ offset: true }),
            values: TimelineValuesSchema,
          }),
        ),
      }),
    ),
  }),
});

type TimelineValues = z.infer<typeof TimelineValuesSchema>;

const TIMELINE_FIELDS = [
  "temperature",
  "temperatureApparent",
  "humidity",
  "precipitationProbability",
  "windSpeed",
  "windDirection",
  "uvIndex",
  "visibility",
  "weatherCode",
  "temperatureMin",
  "temperatureMax",
  "sunriseTime",
  "sunsetTime",
  "uvIndexMax",
  "weatherCodeMax",
  "particulateMatter25",
  "particulateMatter10",
  "pollutantO3",
  "pollutantNO2",
  "pollutantCO",
  "pollutantSO2",
  "epaIndex",
  "epaHealthConcern",
] as const;

function conditionFor(code: number): WeatherConditionCode {
  if (code === 1000) return "clear";
  if (code === 1100) return "mostly_clear";
  if (code === 1101) return "partly_cloudy";
  if (code === 1102 || code === 1001) return "cloudy";
  if (code === 2000 || code === 2100) return "fog";
  if (code === 4000) return "drizzle";
  if ([4001, 4200, 4201].includes(code)) return "rain";
  if ([5000, 5001, 5100, 5101].includes(code)) return "snow";
  if ([6000, 6001, 6200, 6201, 7000, 7101, 7102].includes(code)) {
    return "sleet";
  }
  if (code === 8000) return "thunderstorm";
  return "unknown";
}

function dateInTimeZone(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

function epaCategoryFor(
  index: number,
  healthConcern?: number,
): AirQualityCategory {
  const concern = healthConcern ??
    (index <= 50
      ? 0
      : index <= 100
        ? 1
        : index <= 150
          ? 2
          : index <= 200
            ? 3
            : index <= 300
              ? 4
              : 5);
  return [
    "good",
    "moderate",
    "unhealthy_for_sensitive_groups",
    "unhealthy",
    "very_unhealthy",
    "hazardous",
  ][concern] as AirQualityCategory;
}

function airQualityIndices(values: TimelineValues): AirQualityIndex[] {
  return values.epaIndex === undefined
    ? []
    : [
        {
          scale: "us-epa",
          value: values.epaIndex,
          category: epaCategoryFor(values.epaIndex, values.epaHealthConcern),
        },
      ];
}

function pollutantSet(values: TimelineValues): PollutantSet {
  return {
    ...(values.particulateMatter25 === undefined
      ? {}
      : {
          particulateMatter2_5: {
            value: values.particulateMatter25,
            unit: "micrograms_per_cubic_metre" as const,
          },
        }),
    ...(values.particulateMatter10 === undefined
      ? {}
      : {
          particulateMatter10: {
            value: values.particulateMatter10,
            unit: "micrograms_per_cubic_metre" as const,
          },
        }),
    ...(values.pollutantO3 === undefined
      ? {}
      : {
          ozone: {
            value: values.pollutantO3,
            unit: "parts_per_billion" as const,
          },
        }),
    ...(values.pollutantNO2 === undefined
      ? {}
      : {
          nitrogenDioxide: {
            value: values.pollutantNO2,
            unit: "parts_per_billion" as const,
          },
        }),
    ...(values.pollutantCO === undefined
      ? {}
      : {
          carbonMonoxide: {
            value: values.pollutantCO,
            unit: "parts_per_million" as const,
          },
        }),
    ...(values.pollutantSO2 === undefined
      ? {}
      : {
          sulphurDioxide: {
            value: values.pollutantSO2,
            unit: "parts_per_billion" as const,
          },
        }),
  };
}

function hasAirQuality(values: TimelineValues): boolean {
  return (
    values.epaIndex !== undefined ||
    values.particulateMatter25 !== undefined ||
    values.particulateMatter10 !== undefined ||
    values.pollutantO3 !== undefined ||
    values.pollutantNO2 !== undefined ||
    values.pollutantCO !== undefined ||
    values.pollutantSO2 !== undefined
  );
}

function requiredValue(
  values: TimelineValues,
  field:
    | "temperature"
    | "temperatureMin"
    | "temperatureMax"
    | "weatherCode"
    | "weatherCodeMax",
): number {
  const value = values[field];
  if (value === undefined) {
    throw new Error(`Tomorrow.io returned no ${field} value`);
  }
  return value;
}

export interface TomorrowIoOptions {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
  timelinesBaseUrl?: string;
  airQualityEnabled?: boolean;
  now?: () => Date;
}

export class TomorrowIoProvider implements WeatherProvider {
  readonly descriptor: WeatherProvider["descriptor"];
  readonly getWeatherAndAirQuality?: (
    location: ResolvedLocation,
    request: WeatherRequest,
  ) => Promise<WeatherAirQualityBundle>;

  static descriptor(
    airQualityEnabled: boolean,
  ): WeatherProvider["descriptor"] {
    return {
      id: "tomorrow-io",
      name: "Tomorrow.io",
      capabilities: {
        current: true,
        hourly: true,
        daily: true,
        alerts: true,
        airQuality: airQualityEnabled,
        pollen: false,
        historical: true,
      },
      locationRequirements: {
        coordinates: true,
        elevation: false,
        providerLocationKey: false,
      },
      attribution: {
        text: "Weather data by Tomorrow.io",
        url: "https://www.tomorrow.io/weather-api/",
      },
      dataProfile: {
        weatherSpatial: "point",
        currentSource: "forecast",
        hourlyGranularity: "hourly",
        dailyGranularity: "native",
        airQualityIntegration: "bundled",
        airQualityCoverage: "global",
      },
      featureProfile: {
        sunriseSunset: {
          availability: "available",
          source: "forecast",
          integrated: true,
          detail: "Daily core weather fields.",
        },
        uv: {
          availability: "available",
          source: "forecast",
          integrated: true,
          detail: "Current, hourly, and daily maximum UV.",
        },
        visibility: {
          availability: "available",
          source: "forecast",
          integrated: true,
          detail: "Current and hourly visibility distance.",
        },
        airQuality: {
          availability: "available",
          source: "forecast",
          integrated: airQualityEnabled,
          detail: airQualityEnabled
            ? "Current and hourly US EPA AQI plus six pollutants from a shared Timeline request."
            : "Adapter support exists, but AQ is disabled because the configured plan does not expose the fields.",
        },
        pollen: {
          availability: "available",
          source: "forecast",
          integrated: false,
          detail:
            "Worldwide overall indices exist, but the configured plan does not expose the fields.",
        },
      },
    };
  }

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #timelinesBaseUrl: string;
  readonly #now: () => Date;

  constructor(options: TomorrowIoOptions) {
    this.#apiKey = options.apiKey.trim();
    if (this.#apiKey.length < 8) throw new Error("Tomorrow.io API key is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl = options.baseUrl ?? "https://api.tomorrow.io/v4/weather/forecast";
    this.#timelinesBaseUrl =
      options.timelinesBaseUrl ?? "https://api.tomorrow.io/v4/timelines";
    this.#now = options.now ?? (() => new Date());
    const airQualityEnabled = options.airQualityEnabled ?? false;
    this.descriptor = TomorrowIoProvider.descriptor(airQualityEnabled);
    if (airQualityEnabled) {
      this.getWeatherAndAirQuality = (location, request) =>
        this.#getWeatherAndAirQuality(location, request);
    }
  }

  async getWeather(location: ResolvedLocation, _request: WeatherRequest) {
    const url = new URL(this.#baseUrl);
    url.searchParams.set(
      "location",
      `${location.coordinates.latitude},${location.coordinates.longitude}`,
    );
    url.searchParams.set("units", "metric");
    url.searchParams.set("apikey", this.#apiKey);

    const response = await this.#fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Tomorrow.io forecast returned ${response.status}`);
    }
    const forecast = ForecastSchema.parse(await response.json());
    const fetchedAt = this.#now();
    const current =
      forecast.timelines.minutely?.[0] ?? forecast.timelines.hourly[0];
    if (current === undefined) throw new Error("Tomorrow.io returned no current interval");

    return {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: current.time,
        temperatureCelsius: current.values.temperature,
        ...(current.values.temperatureApparent === undefined
          ? {}
          : { feelsLikeCelsius: current.values.temperatureApparent }),
        ...(current.values.humidity === undefined
          ? {}
          : { relativeHumidityPercent: current.values.humidity }),
        ...(current.values.precipitationProbability === undefined
          ? {}
          : {
              precipitationProbabilityPercent:
                current.values.precipitationProbability,
            }),
        ...(current.values.windSpeed === undefined
          ? {}
          : { windSpeedMetresPerSecond: current.values.windSpeed }),
        ...(current.values.windDirection === undefined
          ? {}
          : { windDirectionDegrees: current.values.windDirection }),
        condition: conditionFor(current.values.weatherCode),
      },
      hourly: forecast.timelines.hourly.slice(0, 24).map((hour) => ({
        validAt: hour.time,
        intervalMinutes: 60,
        temperatureCelsius: hour.values.temperature,
        ...(hour.values.precipitationProbability === undefined
          ? {}
          : {
              precipitationProbabilityPercent:
                hour.values.precipitationProbability,
            }),
        ...(hour.values.uvIndex === undefined ? {} : { uvIndex: hour.values.uvIndex }),
        ...(hour.values.visibility === undefined
          ? {}
          : { visibilityMetres: hour.values.visibility * 1_000 }),
        condition: conditionFor(hour.values.weatherCode),
      })),
      daily: forecast.timelines.daily.slice(0, 7).map((day) => ({
        date: dateInTimeZone(day.time, location.timezone),
        minimumTemperatureCelsius: day.values.temperatureMin,
        maximumTemperatureCelsius: day.values.temperatureMax,
        ...(day.values.sunriseTime == null
          ? {}
          : { sunriseAt: day.values.sunriseTime }),
        ...(day.values.sunsetTime == null ? {} : { sunsetAt: day.values.sunsetTime }),
        ...(day.values.uvIndexMax === undefined
          ? {}
          : { maximumUvIndex: day.values.uvIndexMax }),
        condition: conditionFor(day.values.weatherCodeMax),
      })),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 15 * 60_000).toISOString(),
        staleAfter: new Date(fetchedAt.getTime() + 24 * 60 * 60_000).toISOString(),
      },
    };
  }

  async #getWeatherAndAirQuality(
    location: ResolvedLocation,
    _request: WeatherRequest,
  ): Promise<WeatherAirQualityBundle> {
    const url = new URL(this.#timelinesBaseUrl);
    url.searchParams.set("apikey", this.#apiKey);
    const response = await this.#fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        location: [
          location.coordinates.longitude,
          location.coordinates.latitude,
        ],
        fields: TIMELINE_FIELDS,
        timesteps: ["current", "1h", "1d"],
        startTime: "now",
        endTime: "nowPlus5d",
        timezone: location.timezone,
        dailyStartHour: 0,
        units: "metric",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Tomorrow.io timelines returned ${response.status}`);
    }

    const timelines = TimelinesSchema.parse(await response.json()).data.timelines;
    const current = timelines.find((timeline) => timeline.timestep === "current")
      ?.intervals[0];
    const hourly = timelines.find((timeline) => timeline.timestep === "1h")
      ?.intervals.slice(0, 24);
    const daily = timelines.find((timeline) => timeline.timestep === "1d")
      ?.intervals.slice(0, 7);
    if (current === undefined || hourly === undefined || daily === undefined) {
      throw new Error("Tomorrow.io returned incomplete weather timelines");
    }
    if (!hasAirQuality(current.values)) {
      throw new Error(
        "Tomorrow.io returned no air-quality fields; check the configured plan",
      );
    }

    const fetchedAt = this.#now();
    const weather = {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: current.startTime,
        temperatureCelsius: requiredValue(current.values, "temperature"),
        ...(current.values.temperatureApparent === undefined
          ? {}
          : { feelsLikeCelsius: current.values.temperatureApparent }),
        ...(current.values.humidity === undefined
          ? {}
          : { relativeHumidityPercent: current.values.humidity }),
        ...(current.values.precipitationProbability === undefined
          ? {}
          : {
              precipitationProbabilityPercent:
                current.values.precipitationProbability,
            }),
        ...(current.values.windSpeed === undefined
          ? {}
          : { windSpeedMetresPerSecond: current.values.windSpeed }),
        ...(current.values.windDirection === undefined
          ? {}
          : { windDirectionDegrees: current.values.windDirection }),
        condition: conditionFor(requiredValue(current.values, "weatherCode")),
      },
      hourly: hourly.map((hour) => ({
        validAt: hour.startTime,
        intervalMinutes: 60,
        temperatureCelsius: requiredValue(hour.values, "temperature"),
        ...(hour.values.precipitationProbability === undefined
          ? {}
          : {
              precipitationProbabilityPercent:
                hour.values.precipitationProbability,
            }),
        ...(hour.values.uvIndex === undefined
          ? {}
          : { uvIndex: hour.values.uvIndex }),
        ...(hour.values.visibility === undefined
          ? {}
          : { visibilityMetres: hour.values.visibility * 1_000 }),
        condition: conditionFor(requiredValue(hour.values, "weatherCode")),
      })),
      daily: daily.map((day) => ({
        date: dateInTimeZone(day.startTime, location.timezone),
        minimumTemperatureCelsius: requiredValue(
          day.values,
          "temperatureMin",
        ),
        maximumTemperatureCelsius: requiredValue(
          day.values,
          "temperatureMax",
        ),
        ...(day.values.sunriseTime == null
          ? {}
          : { sunriseAt: day.values.sunriseTime }),
        ...(day.values.sunsetTime == null
          ? {}
          : { sunsetAt: day.values.sunsetTime }),
        ...(day.values.uvIndexMax === undefined
          ? {}
          : { maximumUvIndex: day.values.uvIndexMax }),
        condition: conditionFor(requiredValue(day.values, "weatherCodeMax")),
      })),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 15 * 60_000).toISOString(),
        staleAfter: new Date(
          fetchedAt.getTime() + 24 * 60 * 60_000,
        ).toISOString(),
      },
    };

    const airQualityPoint = (
      interval: { startTime: string; values: TimelineValues },
      includeInterval: boolean,
    ) => ({
      validAt: interval.startTime,
      ...(includeInterval ? { intervalMinutes: 60 } : {}),
      indices: airQualityIndices(interval.values),
      pollutants: pollutantSet(interval.values),
    });

    return {
      weather,
      airQuality: {
        current: airQualityPoint(current, false),
        hourly: hourly
          .filter((hour) => hasAirQuality(hour.values))
          .map((hour) => airQualityPoint(hour, true)),
        metadata: {
          providerId: this.descriptor.id,
          fetchedAt: fetchedAt.toISOString(),
          expiresAt: new Date(fetchedAt.getTime() + 30 * 60_000).toISOString(),
          staleAfter: new Date(
            fetchedAt.getTime() + 24 * 60 * 60_000,
          ).toISOString(),
          spatialRepresentation: "point",
        },
      },
    };
  }
}
