import type {
  AirQualityProvider,
  WeatherProvider,
  WeatherRequest,
} from "@weather/provider-core";
import type {
  AirQualityCategory,
  PollutantSet,
  ResolvedLocation,
  WeatherConditionCode,
} from "@weather/weather-domain";
import { z } from "zod";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

const WeatherCodeSchema = z.object({ id: z.number().int() });
const CurrentSchema = z.object({
  dt: z.number(),
  main: z.object({
    temp: z.number(),
    feels_like: z.number().optional(),
    humidity: z.number().optional(),
  }),
  wind: z.object({
    speed: z.number().optional(),
    deg: z.number().optional(),
  }),
  weather: z.array(WeatherCodeSchema),
  sys: z.object({
    sunrise: z.number().optional(),
    sunset: z.number().optional(),
  }),
});

const ThreeHourForecastSchema = z.object({
  list: z.array(
    z.object({
      dt: z.number(),
      main: z.object({
        temp: z.number(),
        temp_min: z.number(),
        temp_max: z.number(),
      }),
      pop: z.number().min(0).max(1).optional(),
      visibility: z.number().min(0).optional(),
      weather: z.array(WeatherCodeSchema),
    }),
  ),
});

const AirPollutionPointSchema = z.object({
  dt: z.number(),
  main: z.object({ aqi: z.number().int().min(1).max(5) }),
  components: z.object({
    co: z.number().min(0),
    no: z.number().min(0),
    no2: z.number().min(0),
    o3: z.number().min(0),
    so2: z.number().min(0),
    pm2_5: z.number().min(0),
    pm10: z.number().min(0),
    nh3: z.number().min(0),
  }),
});

const AirPollutionSchema = z.object({
  list: z.array(AirPollutionPointSchema),
});

function conditionFor(code: number | undefined): WeatherConditionCode {
  if (code === undefined) return "unknown";
  if (code >= 200 && code < 300) return "thunderstorm";
  if (code >= 300 && code < 400) return "drizzle";
  if (code === 511 || (code >= 611 && code <= 616)) return "sleet";
  if (code >= 500 && code < 600) return "rain";
  if (code >= 600 && code < 700) return "snow";
  if (code >= 700 && code < 800) return "fog";
  if (code === 800) return "clear";
  if (code === 801) return "mostly_clear";
  if (code === 802) return "partly_cloudy";
  if (code === 803 || code === 804) return "cloudy";
  return "unknown";
}

function instant(epochSeconds: number): string {
  return new Date(epochSeconds * 1_000).toISOString();
}

function dateInTimeZone(epochSeconds: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochSeconds * 1_000));
}

function openWeatherAqiCategory(value: number): AirQualityCategory {
  if (value === 1) return "good";
  if (value === 2) return "fair";
  if (value === 3) return "moderate";
  if (value === 4) return "poor";
  if (value === 5) return "very_poor";
  return "unknown";
}

function concentration(value: number) {
  return {
    value,
    unit: "micrograms_per_cubic_metre" as const,
  };
}

function openWeatherPollutants(
  components: z.infer<typeof AirPollutionPointSchema>["components"],
): PollutantSet {
  return {
    particulateMatter2_5: concentration(components.pm2_5),
    particulateMatter10: concentration(components.pm10),
    carbonMonoxide: concentration(components.co),
    nitrogenMonoxide: concentration(components.no),
    nitrogenDioxide: concentration(components.no2),
    sulphurDioxide: concentration(components.so2),
    ozone: concentration(components.o3),
    ammonia: concentration(components.nh3),
  };
}

function openWeatherAirQualityPoint(
  point: z.infer<typeof AirPollutionPointSchema>,
) {
  return {
    validAt: instant(point.dt),
    intervalMinutes: 60,
    indices: [
      {
        scale: "openweather-1-5" as const,
        value: point.main.aqi,
        category: openWeatherAqiCategory(point.main.aqi),
      },
    ],
    pollutants: openWeatherPollutants(point.components),
  };
}

export interface OpenWeatherOptions {
  apiKey: string;
  fetch?: FetchLike;
  currentBaseUrl?: string;
  forecastBaseUrl?: string;
  now?: () => Date;
}

export class OpenWeatherProvider implements WeatherProvider {
  readonly descriptor = {
    id: "openweather",
    name: "OpenWeather",
    capabilities: {
      current: true,
      hourly: true,
      daily: true,
      alerts: true,
      airQuality: true,
      pollen: false,
      historical: true,
    },
    locationRequirements: {
      coordinates: true,
      elevation: false,
      providerLocationKey: false,
    },
    attribution: {
      text: "Weather data by OpenWeather",
      url: "https://openweathermap.org/",
    },
    dataProfile: {
      weatherSpatial: "grid",
      currentSource: "observation",
      hourlyGranularity: "three_hourly",
      dailyGranularity: "derived",
      airQualityIntegration: "separate",
      airQualityCoverage: "global",
    },
    featureProfile: {
      sunriseSunset: {
        availability: "limited",
        source: "forecast",
        integrated: true,
        detail: "Current day only; full daily astronomy requires One Call 3.0.",
      },
      uv: {
        availability: "available",
        source: "forecast",
        integrated: false,
        detail: "Available through One Call 3.0; not connected on this account.",
      },
      visibility: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Hourly visibility distance.",
      },
      airQuality: {
        availability: "available",
        source: "separate_api",
        integrated: true,
        detail: "Global current and hourly data from the Air Pollution API.",
      },
      pollen: {
        availability: "unavailable",
        source: "separate_api",
        integrated: false,
        detail: "No verified pollen fields.",
      },
    },
  } as const;

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #currentBaseUrl: string;
  readonly #forecastBaseUrl: string;
  readonly #now: () => Date;

  constructor(options: OpenWeatherOptions) {
    this.#apiKey = options.apiKey.trim();
    if (this.#apiKey.length < 8) throw new Error("OpenWeather API key is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#currentBaseUrl =
      options.currentBaseUrl ?? "https://api.openweathermap.org/data/2.5/weather";
    this.#forecastBaseUrl =
      options.forecastBaseUrl ?? "https://api.openweathermap.org/data/2.5/forecast";
    this.#now = options.now ?? (() => new Date());
  }

  async getWeather(location: ResolvedLocation, _request: WeatherRequest) {
    const requestUrl = (baseUrl: string) => {
      const url = new URL(baseUrl);
      url.searchParams.set("lat", String(location.coordinates.latitude));
      url.searchParams.set("lon", String(location.coordinates.longitude));
      url.searchParams.set("appid", this.#apiKey);
      url.searchParams.set("units", "metric");
      return url;
    };
    const request = async (url: URL, resource: string) => {
      const response = await this.#fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new Error(`OpenWeather ${resource} returned ${response.status}`);
      }
      return response.json() as Promise<unknown>;
    };
    const [currentBody, forecastBody] = await Promise.all([
      request(requestUrl(this.#currentBaseUrl), "current weather"),
      request(requestUrl(this.#forecastBaseUrl), "3-hour forecast"),
    ]);
    const current = CurrentSchema.parse(currentBody);
    const forecast = ThreeHourForecastSchema.parse(forecastBody);
    const fetchedAt = this.#now();
    const hourly = forecast.list
      .filter(
        (step) =>
          step.dt >= current.dt - 3 * 60 * 60 &&
          step.dt <= current.dt + 24 * 60 * 60,
      );
    const nearestHour = hourly.reduce<(typeof hourly)[number] | undefined>(
      (nearest, hour) =>
        nearest === undefined ||
        Math.abs(hour.dt - current.dt) < Math.abs(nearest.dt - current.dt)
          ? hour
          : nearest,
      undefined,
    );
    const dailyByDate = new Map<
      string,
      {
        minimumTemperatureCelsius: number;
        maximumTemperatureCelsius: number;
        representativeProbability: number;
        condition: WeatherConditionCode;
      }
    >();
    for (const step of forecast.list) {
      const date = dateInTimeZone(step.dt, location.timezone);
      const existing = dailyByDate.get(date);
      const probability = step.pop ?? 0;
      dailyByDate.set(date, {
        minimumTemperatureCelsius: Math.min(
          existing?.minimumTemperatureCelsius ?? Number.POSITIVE_INFINITY,
          step.main.temp_min,
          step.main.temp,
        ),
        maximumTemperatureCelsius: Math.max(
          existing?.maximumTemperatureCelsius ?? Number.NEGATIVE_INFINITY,
          step.main.temp_max,
          step.main.temp,
        ),
        representativeProbability: Math.max(
          existing?.representativeProbability ?? 0,
          probability,
        ),
        condition:
          existing === undefined || probability >= existing.representativeProbability
            ? conditionFor(step.weather[0]?.id)
            : existing.condition,
      });
    }
    const currentDate = dateInTimeZone(current.dt, location.timezone);

    return {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: instant(current.dt),
        temperatureCelsius: current.main.temp,
        ...(current.main.feels_like === undefined
          ? {}
          : { feelsLikeCelsius: current.main.feels_like }),
        ...(current.main.humidity === undefined
          ? {}
          : { relativeHumidityPercent: current.main.humidity }),
        ...(nearestHour?.pop === undefined
          ? {}
          : { precipitationProbabilityPercent: nearestHour.pop * 100 }),
        ...(current.wind.speed === undefined
          ? {}
          : { windSpeedMetresPerSecond: current.wind.speed }),
        ...(current.wind.deg === undefined
          ? {}
          : { windDirectionDegrees: current.wind.deg }),
        condition: conditionFor(current.weather[0]?.id),
      },
      hourly: hourly.map((hour) => ({
        validAt: instant(hour.dt),
        intervalMinutes: 180,
        temperatureCelsius: hour.main.temp,
        ...(hour.pop === undefined
          ? {}
          : { precipitationProbabilityPercent: hour.pop * 100 }),
        ...(hour.visibility === undefined ? {} : { visibilityMetres: hour.visibility }),
        condition: conditionFor(hour.weather[0]?.id),
      })),
      daily: [...dailyByDate.entries()].slice(0, 6).map(([date, day]) => ({
        date,
        minimumTemperatureCelsius: day.minimumTemperatureCelsius,
        maximumTemperatureCelsius: day.maximumTemperatureCelsius,
        ...(date !== currentDate || current.sys.sunrise === undefined
          ? {}
          : { sunriseAt: instant(current.sys.sunrise) }),
        ...(date !== currentDate || current.sys.sunset === undefined
          ? {}
          : { sunsetAt: instant(current.sys.sunset) }),
        condition: day.condition,
      })),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 10 * 60_000).toISOString(),
        staleAfter: new Date(fetchedAt.getTime() + 24 * 60 * 60_000).toISOString(),
      },
    };
  }
}

export interface OpenWeatherAirQualityOptions {
  apiKey: string;
  fetch?: FetchLike;
  currentBaseUrl?: string;
  forecastBaseUrl?: string;
  now?: () => Date;
}

export class OpenWeatherAirQualityProvider implements AirQualityProvider {
  readonly providerId = "openweather";

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #currentBaseUrl: string;
  readonly #forecastBaseUrl: string;
  readonly #now: () => Date;

  constructor(options: OpenWeatherAirQualityOptions) {
    this.#apiKey = options.apiKey.trim();
    if (this.#apiKey.length < 8) throw new Error("OpenWeather API key is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#currentBaseUrl =
      options.currentBaseUrl ??
      "https://api.openweathermap.org/data/2.5/air_pollution";
    this.#forecastBaseUrl =
      options.forecastBaseUrl ??
      "https://api.openweathermap.org/data/2.5/air_pollution/forecast";
    this.#now = options.now ?? (() => new Date());
  }

  async getAirQuality(location: ResolvedLocation) {
    const request = async (baseUrl: string, resource: string) => {
      const url = new URL(baseUrl);
      url.searchParams.set("lat", String(location.coordinates.latitude));
      url.searchParams.set("lon", String(location.coordinates.longitude));
      url.searchParams.set("appid", this.#apiKey);
      const response = await this.#fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new Error(`OpenWeather ${resource} returned ${response.status}`);
      }
      return AirPollutionSchema.parse(await response.json());
    };

    const [currentResponse, forecastResponse] = await Promise.all([
      request(this.#currentBaseUrl, "current air pollution"),
      request(this.#forecastBaseUrl, "air pollution forecast"),
    ]);
    const current = currentResponse.list[0];
    if (current === undefined) {
      throw new Error("OpenWeather returned no current air-quality data");
    }
    const fetchedAt = this.#now();

    return {
      current: openWeatherAirQualityPoint(current),
      hourly: forecastResponse.list
        .filter((point) => point.dt >= current.dt)
        .slice(0, 24)
        .map(openWeatherAirQualityPoint),
      metadata: {
        providerId: this.providerId,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 30 * 60_000).toISOString(),
        staleAfter: new Date(
          fetchedAt.getTime() + 24 * 60 * 60_000,
        ).toISOString(),
        spatialRepresentation: "grid" as const,
      },
    };
  }
}
