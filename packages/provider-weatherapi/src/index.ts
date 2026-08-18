import type { WeatherProvider, WeatherRequest } from "@weather/provider-core";
import type {
  AirQualityCategory,
  AirQualityIndex,
  PollutantSet,
  PollenSet,
  ResolvedLocation,
  WeatherConditionCode,
} from "@weather/weather-domain";
import { z } from "zod";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

const ConditionSchema = z.object({ code: z.number().int() });
const AirQualityValuesSchema = z.object({
  co: z.number().min(0).optional(),
  no2: z.number().min(0).optional(),
  o3: z.number().min(0).optional(),
  so2: z.number().min(0).optional(),
  pm2_5: z.number().min(0).optional(),
  pm10: z.number().min(0).optional(),
  "us-epa-index": z.number().int().min(1).max(6).optional(),
  "gb-defra-index": z.number().int().min(1).max(10).optional(),
});
const PollenValuesSchema = z.object({
  Hazel: z.number().min(0).optional(),
  Alder: z.number().min(0).optional(),
  Birch: z.number().min(0).optional(),
  Oak: z.number().min(0).optional(),
  Grass: z.number().min(0).optional(),
  Mugwort: z.number().min(0).optional(),
  Ragweed: z.number().min(0).optional(),
});
const ForecastSchema = z.object({
  current: z.object({
    last_updated_epoch: z.number(),
    temp_c: z.number(),
    feelslike_c: z.number().optional(),
    humidity: z.number().optional(),
    wind_kph: z.number().optional(),
    wind_degree: z.number().optional(),
    condition: ConditionSchema,
    air_quality: AirQualityValuesSchema.optional(),
    pollen: PollenValuesSchema.optional(),
  }),
  forecast: z.object({
    forecastday: z.array(
      z.object({
        date: z.iso.date(),
        day: z.object({
          maxtemp_c: z.number(),
          mintemp_c: z.number(),
          uv: z.number().min(0).optional(),
          condition: ConditionSchema,
        }),
        astro: z.object({
          sunrise: z.string(),
          sunset: z.string(),
        }),
        hour: z.array(
          z.object({
            time_epoch: z.number(),
            temp_c: z.number(),
            chance_of_rain: z.number().min(0).max(100).optional(),
            chance_of_snow: z.number().min(0).max(100).optional(),
            uv: z.number().min(0).optional(),
            vis_km: z.number().min(0).optional(),
            condition: ConditionSchema,
            air_quality: AirQualityValuesSchema.optional(),
            pollen: PollenValuesSchema.optional(),
          }),
        ),
      }),
    ),
  }),
});

function conditionFor(code: number): WeatherConditionCode {
  if (code === 1000) return "clear";
  if (code === 1003) return "partly_cloudy";
  if (code === 1006 || code === 1009) return "cloudy";
  if ([1030, 1135, 1147].includes(code)) return "fog";
  if ([1069, 1204, 1207, 1249, 1252].includes(code)) return "sleet";
  if ([1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1255, 1258, 1261, 1264].includes(code)) return "snow";
  if ([1072, 1150, 1153, 1168, 1171].includes(code)) return "drizzle";
  if ((code >= 1180 && code <= 1201) || (code >= 1240 && code <= 1246) || code === 1063) return "rain";
  if (code === 1087 || (code >= 1273 && code <= 1282)) return "thunderstorm";
  return "unknown";
}

function instant(epochSeconds: number): string {
  return new Date(epochSeconds * 1_000).toISOString();
}

function zonedInstant(
  date: string,
  clock: string,
  timezone: string,
): string | undefined {
  const match = /^(\d{1,2}):(\d{2})\s+(AM|PM)$/i.exec(clock.trim());
  if (match === null) return undefined;
  const [, rawHour = "0", rawMinute = "0", meridiem = "AM"] = match;
  let hour = Number(rawHour) % 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, Number(rawMinute));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(targetAsUtc));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const representedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
  );
  return new Date(targetAsUtc - (representedAsUtc - targetAsUtc)).toISOString();
}

function weatherApiUsEpaCategory(value: number): AirQualityCategory {
  if (value === 1) return "good";
  if (value === 2) return "moderate";
  if (value === 3) return "unhealthy_for_sensitive_groups";
  if (value === 4) return "unhealthy";
  if (value === 5) return "very_unhealthy";
  if (value === 6) return "hazardous";
  return "unknown";
}

function airQualityIndices(
  values: z.infer<typeof AirQualityValuesSchema>,
): AirQualityIndex[] {
  return [
    ...(values["us-epa-index"] === undefined
      ? []
      : [
          {
            scale: "weatherapi-us-epa-category" as const,
            value: values["us-epa-index"],
            category: weatherApiUsEpaCategory(values["us-epa-index"]),
          },
        ]),
    ...(values["gb-defra-index"] === undefined
      ? []
      : [
          {
            scale: "uk-defra" as const,
            value: values["gb-defra-index"],
          },
        ]),
  ];
}

function concentration(value: number | undefined) {
  return value === undefined
    ? undefined
    : {
        value,
        unit: "micrograms_per_cubic_metre" as const,
      };
}

function pollutantSet(
  values: z.infer<typeof AirQualityValuesSchema>,
): PollutantSet {
  const particulateMatter2_5 = concentration(values.pm2_5);
  const particulateMatter10 = concentration(values.pm10);
  const carbonMonoxide = concentration(values.co);
  const nitrogenDioxide = concentration(values.no2);
  const sulphurDioxide = concentration(values.so2);
  const ozone = concentration(values.o3);

  return {
    ...(particulateMatter2_5 === undefined ? {} : { particulateMatter2_5 }),
    ...(particulateMatter10 === undefined ? {} : { particulateMatter10 }),
    ...(carbonMonoxide === undefined ? {} : { carbonMonoxide }),
    ...(nitrogenDioxide === undefined ? {} : { nitrogenDioxide }),
    ...(sulphurDioxide === undefined ? {} : { sulphurDioxide }),
    ...(ozone === undefined ? {} : { ozone }),
  };
}

function hasAirQuality(values: z.infer<typeof AirQualityValuesSchema>): boolean {
  return (
    values["us-epa-index"] !== undefined ||
    values["gb-defra-index"] !== undefined
  );
}

function airQualityPoint(
  validAtEpoch: number,
  values: z.infer<typeof AirQualityValuesSchema>,
) {
  return {
    validAt: instant(validAtEpoch),
    intervalMinutes: 60,
    indices: airQualityIndices(values),
    pollutants: pollutantSet(values),
  };
}

function pollenConcentration(value: number | undefined) {
  return value === undefined
    ? undefined
    : { value, unit: "grains_per_cubic_metre" as const };
}

function pollenSet(values: z.infer<typeof PollenValuesSchema>): PollenSet {
  const entries = [
    ["hazel", values.Hazel],
    ["alder", values.Alder],
    ["birch", values.Birch],
    ["oak", values.Oak],
    ["grass", values.Grass],
    ["mugwort", values.Mugwort],
    ["ragweed", values.Ragweed],
  ] as const;
  return Object.fromEntries(
    entries.flatMap(([name, value]) => {
      const concentration = pollenConcentration(value);
      return concentration === undefined ? [] : [[name, concentration]];
    }),
  );
}

function hasPollen(values: z.infer<typeof PollenValuesSchema>): boolean {
  return Object.keys(pollenSet(values)).length > 0;
}

function pollenPoint(
  validAtEpoch: number,
  values: z.infer<typeof PollenValuesSchema>,
) {
  return {
    validAt: instant(validAtEpoch),
    intervalMinutes: 60,
    concentrations: pollenSet(values),
  };
}

export interface WeatherApiOptions {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
}

export class WeatherApiProvider implements WeatherProvider {
  readonly descriptor = {
    id: "weatherapi",
    name: "WeatherAPI.com",
    capabilities: {
      current: true,
      hourly: true,
      daily: true,
      alerts: true,
      airQuality: true,
      pollen: true,
      historical: true,
    },
    locationRequirements: {
      coordinates: true,
      elevation: false,
      providerLocationKey: false,
    },
    attribution: {
      text: "Weather data by WeatherAPI.com",
      url: "https://www.weatherapi.com/",
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
        detail: "Daily astronomy fields.",
      },
      uv: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Current, hourly, and daily UV.",
      },
      visibility: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Current and hourly visibility distance.",
      },
      airQuality: {
        availability: "limited",
        source: "forecast",
        integrated: true,
        detail: "Current and hourly AQ bundled into the weather request.",
      },
      pollen: {
        availability: "limited",
        source: "forecast",
        integrated: true,
        detail: "Current and hourly pollen for supported regions and plans.",
      },
    },
  } as const;

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #now: () => Date;

  constructor(options: WeatherApiOptions) {
    this.#apiKey = options.apiKey.trim();
    if (this.#apiKey.length < 8) throw new Error("WeatherAPI.com API key is required");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl = options.baseUrl ?? "https://api.weatherapi.com/v1/forecast.json";
    this.#now = options.now ?? (() => new Date());
  }

  async getWeather(location: ResolvedLocation, _request: WeatherRequest) {
    return (await this.#getResources(location, false, false)).weather;
  }

  async getWeatherAndAirQuality(
    location: ResolvedLocation,
    _request: WeatherRequest,
  ) {
    const resources = await this.#getResources(location, true, false);
    if (resources.airQuality === undefined) {
      throw new Error("WeatherAPI.com returned no air-quality data");
    }
    return {
      weather: resources.weather,
      airQuality: resources.airQuality,
    };
  }

  async getWeatherAndPollen(
    location: ResolvedLocation,
    _request: WeatherRequest,
  ) {
    const resources = await this.#getResources(location, false, true);
    if (resources.pollen === undefined) {
      throw new Error("WeatherAPI.com returned no pollen data");
    }
    return { weather: resources.weather, pollen: resources.pollen };
  }

  async getWeatherAirQualityAndPollen(
    location: ResolvedLocation,
    _request: WeatherRequest,
  ) {
    const resources = await this.#getResources(location, true, true);
    if (resources.airQuality === undefined) {
      throw new Error("WeatherAPI.com returned no air-quality data");
    }
    if (resources.pollen === undefined) {
      throw new Error("WeatherAPI.com returned no pollen data");
    }
    return {
      weather: resources.weather,
      airQuality: resources.airQuality,
      pollen: resources.pollen,
    };
  }

  async #getResources(
    location: ResolvedLocation,
    includeAirQuality: boolean,
    includePollen: boolean,
  ) {
    const url = new URL(this.#baseUrl);
    url.searchParams.set("key", this.#apiKey);
    url.searchParams.set(
      "q",
      `${location.coordinates.latitude},${location.coordinates.longitude}`,
    );
    url.searchParams.set("days", "7");
    url.searchParams.set("aqi", includeAirQuality ? "yes" : "no");
    url.searchParams.set("pollen", includePollen ? "yes" : "no");
    url.searchParams.set("alerts", "no");

    const response = await this.#fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`WeatherAPI.com forecast returned ${response.status}`);
    }
    const forecast = ForecastSchema.parse(await response.json());
    const fetchedAt = this.#now();
    const allHours = forecast.forecast.forecastday
      .flatMap((day) => day.hour)
      .filter((hour) => hour.time_epoch >= forecast.current.last_updated_epoch - 3_600)
      .slice(0, 24);
    const nearestHour = allHours.reduce<(typeof allHours)[number] | undefined>(
      (nearest, hour) =>
        nearest === undefined ||
        Math.abs(hour.time_epoch - forecast.current.last_updated_epoch) <
          Math.abs(nearest.time_epoch - forecast.current.last_updated_epoch)
          ? hour
          : nearest,
      undefined,
    );
    const currentPrecipitation =
      nearestHour === undefined
        ? undefined
        : Math.max(nearestHour.chance_of_rain ?? 0, nearestHour.chance_of_snow ?? 0);

    const weather = {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: instant(forecast.current.last_updated_epoch),
        temperatureCelsius: forecast.current.temp_c,
        ...(forecast.current.feelslike_c === undefined
          ? {}
          : { feelsLikeCelsius: forecast.current.feelslike_c }),
        ...(forecast.current.humidity === undefined
          ? {}
          : { relativeHumidityPercent: forecast.current.humidity }),
        ...(currentPrecipitation === undefined
          ? {}
          : { precipitationProbabilityPercent: currentPrecipitation }),
        ...(forecast.current.wind_kph === undefined
          ? {}
          : { windSpeedMetresPerSecond: forecast.current.wind_kph / 3.6 }),
        ...(forecast.current.wind_degree === undefined
          ? {}
          : { windDirectionDegrees: forecast.current.wind_degree }),
        condition: conditionFor(forecast.current.condition.code),
      },
      hourly: allHours.map((hour) => ({
        validAt: instant(hour.time_epoch),
        intervalMinutes: 60,
        temperatureCelsius: hour.temp_c,
        precipitationProbabilityPercent: Math.max(
          hour.chance_of_rain ?? 0,
          hour.chance_of_snow ?? 0,
        ),
        ...(hour.uv === undefined ? {} : { uvIndex: hour.uv }),
        ...(hour.vis_km === undefined ? {} : { visibilityMetres: hour.vis_km * 1_000 }),
        condition: conditionFor(hour.condition.code),
      })),
      daily: forecast.forecast.forecastday.slice(0, 7).map((forecastDay) => {
        const sunriseAt = zonedInstant(
          forecastDay.date,
          forecastDay.astro.sunrise,
          location.timezone,
        );
        const sunsetAt = zonedInstant(
          forecastDay.date,
          forecastDay.astro.sunset,
          location.timezone,
        );
        return {
          date: forecastDay.date,
          minimumTemperatureCelsius: forecastDay.day.mintemp_c,
          maximumTemperatureCelsius: forecastDay.day.maxtemp_c,
          ...(sunriseAt === undefined ? {} : { sunriseAt }),
          ...(sunsetAt === undefined ? {} : { sunsetAt }),
          ...(forecastDay.day.uv === undefined
            ? {}
            : { maximumUvIndex: forecastDay.day.uv }),
          condition: conditionFor(forecastDay.day.condition.code),
        };
      }),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 10 * 60_000).toISOString(),
        staleAfter: new Date(fetchedAt.getTime() + 24 * 60 * 60_000).toISOString(),
      },
    };

    const currentAirQuality = forecast.current.air_quality;
    const airQuality =
      includeAirQuality &&
      currentAirQuality !== undefined &&
      hasAirQuality(currentAirQuality)
        ? {
            current: airQualityPoint(
              forecast.current.last_updated_epoch,
              currentAirQuality,
            ),
            hourly: allHours.flatMap((hour) => {
              const values = hour.air_quality;
              return values === undefined || !hasAirQuality(values)
                ? []
                : [airQualityPoint(hour.time_epoch, values)];
            }),
            metadata: {
              providerId: this.descriptor.id,
              fetchedAt: fetchedAt.toISOString(),
              expiresAt: new Date(
                fetchedAt.getTime() + 30 * 60_000,
              ).toISOString(),
              staleAfter: new Date(
                fetchedAt.getTime() + 24 * 60 * 60_000,
              ).toISOString(),
              spatialRepresentation: "point" as const,
            },
          }
        : undefined;
    const currentPollen = forecast.current.pollen;
    const pollen =
      includePollen
        ? {
            ...(currentPollen === undefined || !hasPollen(currentPollen)
              ? {}
              : {
                  current: pollenPoint(
                    forecast.current.last_updated_epoch,
                    currentPollen,
                  ),
                }),
            hourly: allHours.flatMap((hour) => {
              const values = hour.pollen;
              return values === undefined || !hasPollen(values)
                ? []
                : [pollenPoint(hour.time_epoch, values)];
            }),
            metadata: {
              providerId: this.descriptor.id,
              fetchedAt: fetchedAt.toISOString(),
              expiresAt: new Date(
                fetchedAt.getTime() + 60 * 60_000,
              ).toISOString(),
              staleAfter: new Date(
                fetchedAt.getTime() + 24 * 60 * 60_000,
              ).toISOString(),
              spatialRepresentation: "point" as const,
            },
          }
        : undefined;

    return {
      weather,
      ...(airQuality === undefined ? {} : { airQuality }),
      ...(pollen === undefined ? {} : { pollen }),
    };
  }
}
