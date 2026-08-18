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

const NullableNumber = z.number().nullable().optional();
const ConditionsSchema = z.object({
  datetimeEpoch: z.number(),
  temp: z.number(),
  feelslike: NullableNumber,
  humidity: NullableNumber,
  precipprob: NullableNumber,
  windspeed: NullableNumber,
  winddir: NullableNumber,
  visibility: NullableNumber,
  uvindex: NullableNumber,
  icon: z.string().optional(),
  pm1: NullableNumber,
  pm2p5: NullableNumber,
  pm10: NullableNumber,
  o3: NullableNumber,
  no2: NullableNumber,
  so2: NullableNumber,
  co: NullableNumber,
  aqius: NullableNumber,
  aqieur: NullableNumber,
});

type Conditions = z.infer<typeof ConditionsSchema>;

const WEATHER_ELEMENTS = [
  "datetime",
  "datetimeEpoch",
  "temp",
  "tempmax",
  "tempmin",
  "feelslike",
  "humidity",
  "precipprob",
  "windspeed",
  "winddir",
  "visibility",
  "uvindex",
  "icon",
  "sunriseEpoch",
  "sunsetEpoch",
] as const;

const AIR_QUALITY_ELEMENTS = [
  "pm1",
  "pm2p5",
  "pm10",
  "o3",
  "no2",
  "so2",
  "co",
  "aqius",
  "aqieur",
] as const;

const ForecastSchema = z.object({
  currentConditions: ConditionsSchema,
  days: z.array(
    z.object({
      datetime: z.iso.date(),
      tempmin: z.number(),
      tempmax: z.number(),
      sunriseEpoch: NullableNumber,
      sunsetEpoch: NullableNumber,
      uvindex: NullableNumber,
      icon: z.string().optional(),
      hours: z.array(ConditionsSchema).default([]),
    }),
  ),
});

function conditionFor(icon: string | undefined): WeatherConditionCode {
  if (icon === undefined) return "unknown";
  if (icon.startsWith("clear")) return "clear";
  if (icon.startsWith("partly-cloudy")) return "partly_cloudy";
  if (icon === "cloudy") return "cloudy";
  if (icon.includes("fog")) return "fog";
  if (icon.includes("thunder")) return "thunderstorm";
  if (icon.includes("sleet") || icon.includes("freezing")) return "sleet";
  if (icon.includes("snow")) return "snow";
  if (icon.includes("rain") || icon.includes("showers")) return "rain";
  return "unknown";
}

function instant(epochSeconds: number): string {
  return new Date(epochSeconds * 1_000).toISOString();
}

function dateInTimeZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function usEpaCategory(value: number): AirQualityCategory {
  if (value <= 50) return "good";
  if (value <= 100) return "moderate";
  if (value <= 150) return "unhealthy_for_sensitive_groups";
  if (value <= 200) return "unhealthy";
  if (value <= 300) return "very_unhealthy";
  return "hazardous";
}

function europeanCategory(value: number): AirQualityCategory {
  if (value <= 1) return "good";
  if (value <= 2) return "fair";
  if (value <= 3) return "moderate";
  if (value <= 4) return "poor";
  if (value <= 5) return "very_poor";
  return "extremely_poor";
}

function airQualityIndices(conditions: Conditions): AirQualityIndex[] {
  return [
    ...(conditions.aqieur == null
      ? []
      : [
          {
            scale: "visual-crossing-european-category" as const,
            value: conditions.aqieur,
            category: europeanCategory(conditions.aqieur),
          },
        ]),
    ...(conditions.aqius == null
      ? []
      : [
          {
            scale: "us-epa" as const,
            value: conditions.aqius,
            category: usEpaCategory(conditions.aqius),
          },
        ]),
  ];
}

function pollutantSet(conditions: Conditions): PollutantSet {
  const concentration = (value: number) => ({
    value,
    unit: "micrograms_per_cubic_metre" as const,
  });
  return {
    ...(conditions.pm1 == null
      ? {}
      : { particulateMatter1: concentration(conditions.pm1) }),
    ...(conditions.pm2p5 == null
      ? {}
      : { particulateMatter2_5: concentration(conditions.pm2p5) }),
    ...(conditions.pm10 == null
      ? {}
      : { particulateMatter10: concentration(conditions.pm10) }),
    ...(conditions.o3 == null ? {} : { ozone: concentration(conditions.o3) }),
    ...(conditions.no2 == null
      ? {}
      : { nitrogenDioxide: concentration(conditions.no2) }),
    ...(conditions.so2 == null
      ? {}
      : { sulphurDioxide: concentration(conditions.so2) }),
    ...(conditions.co == null
      ? {}
      : { carbonMonoxide: concentration(conditions.co) }),
  };
}

function hasAirQuality(conditions: Conditions): boolean {
  return (
    conditions.aqius != null ||
    conditions.aqieur != null ||
    conditions.pm1 != null ||
    conditions.pm2p5 != null ||
    conditions.pm10 != null ||
    conditions.o3 != null ||
    conditions.no2 != null ||
    conditions.so2 != null ||
    conditions.co != null
  );
}

function airQualityPoint(conditions: Conditions, includeInterval: boolean) {
  return {
    validAt: instant(conditions.datetimeEpoch),
    ...(includeInterval ? { intervalMinutes: 60 } : {}),
    indices: airQualityIndices(conditions),
    pollutants: pollutantSet(conditions),
  };
}

export interface VisualCrossingWeatherOptions {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
}

export class VisualCrossingWeatherProvider implements WeatherProvider {
  readonly descriptor = {
    id: "visual-crossing",
    name: "Visual Crossing",
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
      text: "Weather data by Visual Crossing",
      url: "https://www.visualcrossing.com/weather-data/",
    },
    dataProfile: {
      weatherSpatial: "point",
      currentSource: "observation",
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
        detail: "Daily sunrise and sunset times.",
      },
      uv: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Hourly UV and daily maximum UV.",
      },
      visibility: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Hourly visibility distance.",
      },
      airQuality: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Current and hourly US EPA plus European AQI with seven pollutant fields.",
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

  constructor(options: VisualCrossingWeatherOptions) {
    this.#apiKey = options.apiKey.trim();
    if (this.#apiKey.length < 8) throw new Error("Visual Crossing API key is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl =
      options.baseUrl ??
      "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";
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
      throw new Error("Visual Crossing returned no air-quality data");
    }
    return {
      weather: resources.weather,
      airQuality: resources.airQuality,
    };
  }

  async #getResources(location: ResolvedLocation, includeAirQuality: boolean) {
    const fetchedAt = this.#now();
    const startDate = dateInTimeZone(fetchedAt, location.timezone);
    const coordinates = `${location.coordinates.latitude},${location.coordinates.longitude}`;
    const url = new URL(
      `${this.#baseUrl.replace(/\/$/, "")}/${coordinates}/${startDate}/${addDays(startDate, 6)}`,
    );
    url.searchParams.set("key", this.#apiKey);
    url.searchParams.set("unitGroup", "metric");
    url.searchParams.set("contentType", "json");
    url.searchParams.set("include", "current,hours,days");
    url.searchParams.set(
      "elements",
      [
        ...WEATHER_ELEMENTS,
        ...(includeAirQuality ? AIR_QUALITY_ELEMENTS : []),
      ].join(","),
    );

    const response = await this.#fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Visual Crossing forecast returned ${response.status}`);
    }

    const forecast = ForecastSchema.parse(await response.json());
    const currentTimestamp = forecast.currentConditions.datetimeEpoch;
    const hourly = forecast.days
      .flatMap((day) => day.hours)
      .filter((hour) => hour.datetimeEpoch >= currentTimestamp - 3_600)
      .slice(0, 24);
    const nearestHour = hourly.reduce<(typeof hourly)[number] | undefined>(
      (nearest, hour) =>
        nearest === undefined ||
        Math.abs(hour.datetimeEpoch - currentTimestamp) <
          Math.abs(nearest.datetimeEpoch - currentTimestamp)
          ? hour
          : nearest,
      undefined,
    );

    const weather = {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: instant(currentTimestamp),
        temperatureCelsius: forecast.currentConditions.temp,
        ...(forecast.currentConditions.feelslike == null
          ? {}
          : { feelsLikeCelsius: forecast.currentConditions.feelslike }),
        ...(forecast.currentConditions.humidity == null
          ? {}
          : { relativeHumidityPercent: forecast.currentConditions.humidity }),
        ...((forecast.currentConditions.precipprob ?? nearestHour?.precipprob) == null
          ? {}
          : {
              precipitationProbabilityPercent:
                forecast.currentConditions.precipprob ?? nearestHour?.precipprob ?? 0,
            }),
        ...(forecast.currentConditions.windspeed == null
          ? {}
          : { windSpeedMetresPerSecond: forecast.currentConditions.windspeed / 3.6 }),
        ...(forecast.currentConditions.winddir == null
          ? {}
          : { windDirectionDegrees: forecast.currentConditions.winddir }),
        condition: conditionFor(forecast.currentConditions.icon),
      },
      hourly: hourly.map((hour) => ({
        validAt: instant(hour.datetimeEpoch),
        intervalMinutes: 60,
        temperatureCelsius: hour.temp,
        ...(hour.precipprob == null
          ? {}
          : { precipitationProbabilityPercent: hour.precipprob }),
        ...(hour.uvindex == null ? {} : { uvIndex: hour.uvindex }),
        ...(hour.visibility == null
          ? {}
          : { visibilityMetres: hour.visibility * 1_000 }),
        condition: conditionFor(hour.icon),
      })),
      daily: forecast.days.slice(0, 7).map((day) => ({
        date: day.datetime,
        minimumTemperatureCelsius: day.tempmin,
        maximumTemperatureCelsius: day.tempmax,
        ...(day.sunriseEpoch == null ? {} : { sunriseAt: instant(day.sunriseEpoch) }),
        ...(day.sunsetEpoch == null ? {} : { sunsetAt: instant(day.sunsetEpoch) }),
        ...(day.uvindex == null ? {} : { maximumUvIndex: day.uvindex }),
        condition: conditionFor(day.icon),
      })),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 15 * 60_000).toISOString(),
        staleAfter: new Date(fetchedAt.getTime() + 24 * 60 * 60_000).toISOString(),
      },
    };

    if (!includeAirQuality || !hasAirQuality(forecast.currentConditions)) {
      return { weather };
    }

    return {
      weather,
      airQuality: {
        current: airQualityPoint(forecast.currentConditions, false),
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
          spatialRepresentation: "point" as const,
        },
      },
    };
  }
}
