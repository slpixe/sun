import type { WeatherProvider, WeatherRequest } from "@weather/provider-core";
import type {
  AirQualityCategory,
  ResolvedLocation,
  WeatherConditionCode,
} from "@weather/weather-domain";
import { z } from "zod";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

const ConditionSchema = z.object({ code: z.number().int() });

const CurrentSchema = z.object({
  data: z.array(
    z.object({
      ts: z.number(),
      temp: z.number(),
      app_temp: z.number().optional(),
      rh: z.number().min(0).max(100).optional(),
      wind_spd: z.number().min(0).optional(),
      wind_dir: z.number().min(0).max(360).optional(),
      aqi: z.number().min(0).optional(),
      weather: ConditionSchema,
    }),
  ),
});

const DailySchema = z.object({
  data: z.array(
    z.object({
      valid_date: z.iso.date(),
      min_temp: z.number(),
      max_temp: z.number(),
      sunrise_ts: z.number().optional(),
      sunset_ts: z.number().optional(),
      uv: z.number().min(0).optional(),
      weather: ConditionSchema,
    }),
  ),
});

function conditionFor(code: number): WeatherConditionCode {
  if (code >= 200 && code <= 233) return "thunderstorm";
  if (code >= 300 && code <= 302) return "drizzle";
  if (code >= 500 && code <= 522) return "rain";
  if (code >= 610 && code <= 612) return "sleet";
  if (code >= 600 && code <= 623) return "snow";
  if (code >= 700 && code <= 751) return "fog";
  if (code === 800) return "clear";
  if (code === 801) return "mostly_clear";
  if (code === 802) return "partly_cloudy";
  if (code === 803 || code === 804) return "cloudy";
  return "unknown";
}

function instant(epochSeconds: number): string {
  return new Date(epochSeconds * 1_000).toISOString();
}

function usEpaCategory(value: number): AirQualityCategory {
  if (value <= 50) return "good";
  if (value <= 100) return "moderate";
  if (value <= 150) return "unhealthy_for_sensitive_groups";
  if (value <= 200) return "unhealthy";
  if (value <= 300) return "very_unhealthy";
  return "hazardous";
}

export interface WeatherbitOptions {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
}

export class WeatherbitProvider implements WeatherProvider {
  readonly descriptor = {
    id: "weatherbit",
    name: "Weatherbit",
    capabilities: {
      current: true,
      hourly: false,
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
      text: "Weather data by Weatherbit",
      url: "https://www.weatherbit.io/",
    },
    dataProfile: {
      weatherSpatial: "grid",
      currentSource: "observation",
      hourlyGranularity: "unavailable",
      dailyGranularity: "native",
      airQualityIntegration: "bundled",
      airQualityCoverage: "global",
    },
    featureProfile: {
      sunriseSunset: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Daily forecast astronomy fields.",
      },
      uv: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Current and daily UV on the configured plan.",
      },
      visibility: {
        availability: "available",
        source: "forecast",
        integrated: false,
        detail: "Current API field; canonical current visibility is not connected yet.",
      },
      airQuality: {
        availability: "limited",
        source: "forecast",
        integrated: true,
        detail: "Current US EPA AQI from the weather response; pollutant and forecast APIs require another plan.",
      },
      pollen: {
        availability: "limited",
        source: "separate_api",
        integrated: false,
        detail:
          "Current 0–4 tree/grass/weed levels are regional and require the separate Air Quality API; the configured plan returns 403.",
      },
    },
  } as const;

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #now: () => Date;

  constructor(options: WeatherbitOptions) {
    this.#apiKey = options.apiKey.trim();
    if (this.#apiKey.length < 8) throw new Error("Weatherbit API key is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl = options.baseUrl ?? "https://api.weatherbit.io/v2.0";
    this.#now = options.now ?? (() => new Date());
  }

  async getWeather(location: ResolvedLocation, _request: WeatherRequest) {
    return (await this.#getResources(location)).weather;
  }

  async getWeatherAndAirQuality(
    location: ResolvedLocation,
    _request: WeatherRequest,
  ) {
    const resources = await this.#getResources(location);
    if (resources.airQuality === undefined) {
      throw new Error("Weatherbit returned no current air-quality index");
    }
    return {
      weather: resources.weather,
      airQuality: resources.airQuality,
    };
  }

  async #getResources(location: ResolvedLocation) {
    const currentUrl = this.#forecastUrl("current", location);
    const dailyUrl = this.#forecastUrl("forecast/daily", location);
    dailyUrl.searchParams.set("days", "7");

    const [currentResponse, dailyResponse] = await Promise.all([
      this.#fetch(currentUrl, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      }),
      this.#fetch(dailyUrl, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      }),
    ]);
    if (!currentResponse.ok) {
      throw new Error(`Weatherbit current conditions returned ${currentResponse.status}`);
    }
    if (!dailyResponse.ok) {
      throw new Error(`Weatherbit daily forecast returned ${dailyResponse.status}`);
    }

    const [currentConditions, dailyForecast] = await Promise.all([
      currentResponse.json().then((body) => CurrentSchema.parse(body)),
      dailyResponse.json().then((body) => DailySchema.parse(body)),
    ]);
    const current = currentConditions.data[0];
    if (current === undefined) throw new Error("Weatherbit returned no current data");
    const fetchedAt = this.#now();

    const weather = {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: instant(current.ts),
        temperatureCelsius: current.temp,
        ...(current.app_temp === undefined
          ? {}
          : { feelsLikeCelsius: current.app_temp }),
        ...(current.rh === undefined
          ? {}
          : { relativeHumidityPercent: current.rh }),
        ...(current.wind_spd === undefined
          ? {}
          : { windSpeedMetresPerSecond: current.wind_spd }),
        ...(current.wind_dir === undefined
          ? {}
          : { windDirectionDegrees: current.wind_dir }),
        condition: conditionFor(current.weather.code),
      },
      daily: dailyForecast.data.slice(0, 7).map((day) => ({
        date: day.valid_date,
        minimumTemperatureCelsius: day.min_temp,
        maximumTemperatureCelsius: day.max_temp,
        ...(day.sunrise_ts === undefined
          ? {}
          : { sunriseAt: instant(day.sunrise_ts) }),
        ...(day.sunset_ts === undefined
          ? {}
          : { sunsetAt: instant(day.sunset_ts) }),
        ...(day.uv === undefined ? {} : { maximumUvIndex: day.uv }),
        condition: conditionFor(day.weather.code),
      })),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 30 * 60_000).toISOString(),
        staleAfter: new Date(
          fetchedAt.getTime() + 24 * 60 * 60_000,
        ).toISOString(),
      },
      attribution: this.descriptor.attribution,
    };

    if (current.aqi === undefined) return { weather };

    return {
      weather,
      airQuality: {
        current: {
          validAt: instant(current.ts),
          indices: [
            {
              scale: "us-epa" as const,
              value: current.aqi,
              category: usEpaCategory(current.aqi),
            },
          ],
          pollutants: {},
        },
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

  #forecastUrl(path: string, location: ResolvedLocation): URL {
    const url = new URL(`${this.#baseUrl.replace(/\/$/, "")}/${path}`);
    url.searchParams.set("lat", String(location.coordinates.latitude));
    url.searchParams.set("lon", String(location.coordinates.longitude));
    url.searchParams.set("units", "M");
    url.searchParams.set("key", this.#apiKey);
    return url;
  }
}
