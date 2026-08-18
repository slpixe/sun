import type { WeatherProvider, WeatherRequest } from "@weather/provider-core";
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

const DataPointSchema = z.object({
  time: z.number(),
  temperature: z.number(),
  apparentTemperature: z.number().optional(),
  humidity: z.number().min(0).max(1).optional(),
  precipProbability: z.number().min(0).max(1).optional(),
  windSpeed: z.number().min(0).optional(),
  windBearing: z.number().min(0).max(360).optional(),
  uvIndex: z.number().min(0).optional(),
  visibility: z.number().min(0).optional(),
  icon: z.string().optional(),
  airQualityIndex: z.number().min(0).optional(),
  pm25: z.number().min(0).optional(),
  pm10: z.number().min(0).optional(),
  ozoneConcentration: z.number().min(0).optional(),
  no2Concentration: z.number().min(0).optional(),
  so2Concentration: z.number().min(0).optional(),
  coConcentration: z.number().min(0).optional(),
});

type DataPoint = z.infer<typeof DataPointSchema>;

const ForecastSchema = z.object({
  currently: DataPointSchema,
  hourly: z.object({ data: z.array(DataPointSchema) }),
  daily: z.object({
    data: z.array(
      z.object({
        time: z.number(),
        temperatureMin: z.number(),
        temperatureMax: z.number(),
        sunriseTime: z.number().optional(),
        sunsetTime: z.number().optional(),
        uvIndex: z.number().min(0).optional(),
        icon: z.string().optional(),
      }),
    ),
  }),
});

function conditionFor(icon: string | undefined): WeatherConditionCode {
  if (icon === undefined) return "unknown";
  if (icon.startsWith("clear")) return "clear";
  if (icon.startsWith("partly-cloudy")) return "partly_cloudy";
  if (icon === "cloudy") return "cloudy";
  if (icon === "fog") return "fog";
  if (icon === "sleet") return "sleet";
  if (icon === "snow") return "snow";
  if (icon === "rain") return "rain";
  if (icon.includes("thunder")) return "thunderstorm";
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

function euCaqiCategory(value: number): AirQualityCategory {
  if (value <= 25) return "good";
  if (value <= 50) return "fair";
  if (value <= 75) return "moderate";
  if (value <= 100) return "poor";
  return "very_poor";
}

function airQualityIndices(point: DataPoint): AirQualityIndex[] {
  return point.airQualityIndex === undefined
    ? []
    : [
        {
          scale: "eu-caqi",
          value: point.airQualityIndex,
          category: euCaqiCategory(point.airQualityIndex),
        },
      ];
}

function pollutantSet(point: DataPoint): PollutantSet {
  return {
    ...(point.pm25 === undefined
      ? {}
      : {
          particulateMatter2_5: {
            value: point.pm25,
            unit: "micrograms_per_cubic_metre" as const,
          },
        }),
    ...(point.pm10 === undefined
      ? {}
      : {
          particulateMatter10: {
            value: point.pm10,
            unit: "micrograms_per_cubic_metre" as const,
          },
        }),
    ...(point.ozoneConcentration === undefined
      ? {}
      : {
          ozone: {
            value: point.ozoneConcentration,
            unit: "parts_per_billion" as const,
          },
        }),
    ...(point.no2Concentration === undefined
      ? {}
      : {
          nitrogenDioxide: {
            value: point.no2Concentration,
            unit: "parts_per_billion" as const,
          },
        }),
    ...(point.so2Concentration === undefined
      ? {}
      : {
          sulphurDioxide: {
            value: point.so2Concentration,
            unit: "parts_per_billion" as const,
          },
        }),
    ...(point.coConcentration === undefined
      ? {}
      : {
          carbonMonoxide: {
            value: point.coConcentration,
            unit: "parts_per_billion" as const,
          },
        }),
  };
}

function hasAirQuality(point: DataPoint): boolean {
  return (
    point.airQualityIndex !== undefined ||
    point.pm25 !== undefined ||
    point.pm10 !== undefined ||
    point.ozoneConcentration !== undefined ||
    point.no2Concentration !== undefined ||
    point.so2Concentration !== undefined ||
    point.coConcentration !== undefined
  );
}

function airQualityPoint(point: DataPoint, includeInterval: boolean) {
  return {
    validAt: instant(point.time),
    ...(includeInterval ? { intervalMinutes: 60 } : {}),
    indices: airQualityIndices(point),
    pollutants: pollutantSet(point),
  };
}

export interface PirateWeatherOptions {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
}

export class PirateWeatherProvider implements WeatherProvider {
  readonly descriptor = {
    id: "pirate-weather",
    name: "Pirate Weather",
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
      text: "Weather data by Pirate Weather",
      url: "https://pirateweather.net/",
    },
    dataProfile: {
      weatherSpatial: "grid",
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
        detail: "Daily calculated sunrise and sunset times.",
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
        integrated: true,
        detail: "Current and hourly EU CAQI plus six pollutant concentrations from Forecast v2.",
      },
      pollen: {
        availability: "unavailable",
        source: "forecast",
        integrated: false,
        detail: "No verified pollen fields.",
      },
    },
  } as const;

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #now: () => Date;

  constructor(options: PirateWeatherOptions) {
    this.#apiKey = options.apiKey.trim();
    if (this.#apiKey.length < 8) throw new Error("Pirate Weather API key is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl =
      options.baseUrl ?? "https://api.pirateweather.net/forecast/weather";
    this.#now = options.now ?? (() => new Date());
  }

  async getWeather(location: ResolvedLocation, _request: WeatherRequest) {
    return (await this.#getResources(location, false)).weather;
  }

  async getWeatherAndAirQuality(
    location: ResolvedLocation,
    _request: WeatherRequest,
  ) {
    const resources = await this.#getResources(location, true);
    if (resources.airQuality === undefined) {
      throw new Error("Pirate Weather returned no air-quality data");
    }
    return {
      weather: resources.weather,
      airQuality: resources.airQuality,
    };
  }

  async #getResources(location: ResolvedLocation, includeAirQuality: boolean) {
    const coordinates = `${location.coordinates.latitude},${location.coordinates.longitude}`;
    const url = new URL(`${this.#baseUrl.replace(/\/$/, "")}/${coordinates}`);
    url.searchParams.set("units", "si");
    url.searchParams.set("version", "2");
    url.searchParams.set("exclude", "minutely,alerts");
    if (includeAirQuality) {
      url.searchParams.set("include", "airqualitydetails");
    }

    const response = await this.#fetch(url, {
      headers: { accept: "application/json", apikey: this.#apiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Pirate Weather forecast returned ${response.status}`);
    }
    const forecast = ForecastSchema.parse(await response.json());
    const fetchedAt = this.#now();

    const hourly = forecast.hourly.data.slice(0, 24);
    const weather = {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: instant(forecast.currently.time),
        temperatureCelsius: forecast.currently.temperature,
        ...(forecast.currently.apparentTemperature === undefined
          ? {}
          : { feelsLikeCelsius: forecast.currently.apparentTemperature }),
        ...(forecast.currently.humidity === undefined
          ? {}
          : { relativeHumidityPercent: forecast.currently.humidity * 100 }),
        ...(forecast.currently.precipProbability === undefined
          ? {}
          : {
              precipitationProbabilityPercent:
                forecast.currently.precipProbability * 100,
            }),
        ...(forecast.currently.windSpeed === undefined
          ? {}
          : { windSpeedMetresPerSecond: forecast.currently.windSpeed }),
        ...(forecast.currently.windBearing === undefined
          ? {}
          : { windDirectionDegrees: forecast.currently.windBearing }),
        condition: conditionFor(forecast.currently.icon),
      },
      hourly: hourly.map((hour) => ({
        validAt: instant(hour.time),
        intervalMinutes: 60,
        temperatureCelsius: hour.temperature,
        ...(hour.precipProbability === undefined
          ? {}
          : { precipitationProbabilityPercent: hour.precipProbability * 100 }),
        ...(hour.uvIndex === undefined ? {} : { uvIndex: hour.uvIndex }),
        ...(hour.visibility === undefined
          ? {}
          : { visibilityMetres: hour.visibility * 1_000 }),
        condition: conditionFor(hour.icon),
      })),
      daily: forecast.daily.data.slice(0, 7).map((day) => ({
        date: dateInTimeZone(day.time, location.timezone),
        minimumTemperatureCelsius: day.temperatureMin,
        maximumTemperatureCelsius: day.temperatureMax,
        ...(day.sunriseTime === undefined
          ? {}
          : { sunriseAt: instant(day.sunriseTime) }),
        ...(day.sunsetTime === undefined ? {} : { sunsetAt: instant(day.sunsetTime) }),
        ...(day.uvIndex === undefined ? {} : { maximumUvIndex: day.uvIndex }),
        condition: conditionFor(day.icon),
      })),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 10 * 60_000).toISOString(),
        staleAfter: new Date(fetchedAt.getTime() + 24 * 60 * 60_000).toISOString(),
      },
    };

    if (!includeAirQuality || !hasAirQuality(forecast.currently)) {
      return { weather };
    }

    return {
      weather,
      airQuality: {
        current: airQualityPoint(forecast.currently, false),
        hourly: hourly
          .filter((hour) => hasAirQuality(hour))
          .map((hour) => airQualityPoint(hour, true)),
        metadata: {
          providerId: this.descriptor.id,
          fetchedAt: fetchedAt.toISOString(),
          expiresAt: new Date(fetchedAt.getTime() + 30 * 60_000).toISOString(),
          staleAfter: new Date(
            fetchedAt.getTime() + 24 * 60 * 60_000,
          ).toISOString(),
          spatialRepresentation: "grid" as const,
        },
      },
    };
  }
}
