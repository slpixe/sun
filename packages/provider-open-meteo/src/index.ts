import type {
  AirQualityProvider,
  LocationSearchProvider,
  PollenProvider,
  WeatherProvider,
  WeatherRequest,
} from "@weather/provider-core";
import type {
  AirQualityCategory,
  AirQualityIndex,
  LocationKind,
  PollutantSet,
  PollenSet,
  ResolvedLocation,
  WeatherConditionCode,
} from "@weather/weather-domain";
import { z } from "zod";

const OpenMeteoLocationSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevation: z.number().optional(),
  timezone: z.string().min(1),
  country_code: z.string().length(2).optional(),
  country: z.string().optional(),
  admin1: z.string().optional(),
  feature_code: z.string().optional(),
  population: z.number().nonnegative().optional(),
});

const OpenMeteoSearchResponseSchema = z.object({
  results: z.array(OpenMeteoLocationSchema).optional(),
});

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface OpenMeteoLocationSearchOptions {
  fetch?: FetchLike;
  baseUrl?: string;
}

function locationKindFor(
  location: z.infer<typeof OpenMeteoLocationSchema>,
): LocationKind {
  const code = location.feature_code ?? "";
  if (code === "AIRP") return "airport";
  if (/^PPLA|^PPLC/.test(code)) return "city";
  if (code.startsWith("PPL")) {
    if ((location.population ?? 0) >= 100_000) return "city";
    if ((location.population ?? 0) >= 10_000) return "town";
    return "village";
  }
  if (code.startsWith("PST")) return "postcode";
  return "other";
}

const LOCATION_RANK: Record<LocationKind, number> = {
  city: 0,
  town: 1,
  village: 2,
  postcode: 3,
  point_of_interest: 4,
  coordinates: 5,
  airport: 6,
  other: 7,
};

function displayNameFor(
  location: z.infer<typeof OpenMeteoLocationSchema>,
): string {
  const name =
    locationKindFor(location) === "airport" &&
    !/airport|aerodrome/i.test(location.name)
      ? `${location.name} Airport`
      : location.name;

  return [name, location.admin1, location.country]
    .filter(
      (part, index, parts): part is string =>
        Boolean(part) && parts.indexOf(part) === index,
    )
    .join(", ");
}

export class OpenMeteoLocationSearchProvider
  implements LocationSearchProvider
{
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;

  constructor(options: OpenMeteoLocationSearchOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl =
      options.baseUrl ?? "https://geocoding-api.open-meteo.com/v1/search";
  }

  async search(
    query: string,
    options: {
      language: string;
      countryCode?: string;
      limit: number;
    },
  ): Promise<ResolvedLocation[]> {
    const url = new URL(this.#baseUrl);
    url.searchParams.set("name", query);
    url.searchParams.set("count", String(options.limit));
    url.searchParams.set("language", options.language);
    url.searchParams.set("format", "json");

    if (options.countryCode) {
      url.searchParams.set("countryCode", options.countryCode);
    }

    const response = await this.#fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo geocoding returned ${response.status}`);
    }

    const body: unknown = await response.json();
    const parsed = OpenMeteoSearchResponseSchema.parse(body);

    return (parsed.results ?? [])
      .sort((a, b) => {
        const rankDifference =
          LOCATION_RANK[locationKindFor(a)] - LOCATION_RANK[locationKindFor(b)];
        return rankDifference || (b.population ?? 0) - (a.population ?? 0);
      })
      .map((location) => ({
        id: `open-meteo:${location.id}`,
        displayName: displayNameFor(location),
        kind: locationKindFor(location),
        coordinates: {
          latitude: location.latitude,
          longitude: location.longitude,
          ...(location.elevation === undefined
            ? {}
            : { elevationMetres: location.elevation }),
        },
        timezone: location.timezone,
        ...(location.country_code === undefined
          ? {}
          : { countryCode: location.country_code }),
        ...(location.admin1 === undefined
          ? {}
          : { administrativeArea: location.admin1 }),
      }));
  }
}

const OpenMeteoForecastSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    wind_direction_10m: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    precipitation_probability: z.array(z.number()),
    uv_index: z.array(z.number().nullable()),
    visibility: z.array(z.number().nullable()),
    weather_code: z.array(z.number()),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    sunrise: z.array(z.string().nullable()),
    sunset: z.array(z.string().nullable()),
    uv_index_max: z.array(z.number().nullable()),
  }),
});

const NullableNumberSchema = z.number().nullable();

const OpenMeteoAirQualitySchema = z.object({
  current: z.object({
    time: z.string(),
    interval: z.number().positive(),
    european_aqi: NullableNumberSchema.optional(),
    us_aqi: NullableNumberSchema.optional(),
    pm10: NullableNumberSchema.optional(),
    pm2_5: NullableNumberSchema.optional(),
    carbon_monoxide: NullableNumberSchema.optional(),
    nitrogen_dioxide: NullableNumberSchema.optional(),
    sulphur_dioxide: NullableNumberSchema.optional(),
    ozone: NullableNumberSchema.optional(),
    alder_pollen: NullableNumberSchema.optional(),
    birch_pollen: NullableNumberSchema.optional(),
    grass_pollen: NullableNumberSchema.optional(),
    mugwort_pollen: NullableNumberSchema.optional(),
    olive_pollen: NullableNumberSchema.optional(),
    ragweed_pollen: NullableNumberSchema.optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    european_aqi: z.array(NullableNumberSchema).optional(),
    us_aqi: z.array(NullableNumberSchema).optional(),
    pm10: z.array(NullableNumberSchema).optional(),
    pm2_5: z.array(NullableNumberSchema).optional(),
    carbon_monoxide: z.array(NullableNumberSchema).optional(),
    nitrogen_dioxide: z.array(NullableNumberSchema).optional(),
    sulphur_dioxide: z.array(NullableNumberSchema).optional(),
    ozone: z.array(NullableNumberSchema).optional(),
    alder_pollen: z.array(NullableNumberSchema).optional(),
    birch_pollen: z.array(NullableNumberSchema).optional(),
    grass_pollen: z.array(NullableNumberSchema).optional(),
    mugwort_pollen: z.array(NullableNumberSchema).optional(),
    olive_pollen: z.array(NullableNumberSchema).optional(),
    ragweed_pollen: z.array(NullableNumberSchema).optional(),
  }),
});

function conditionFor(code: number): WeatherConditionCode {
  if (code === 0) return "clear";
  if (code === 1) return "mostly_clear";
  if (code === 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if (code === 66 || code === 67) return "sleet";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  return "unknown";
}

function utcInstant(value: string): string {
  if (value.endsWith("Z")) return value;
  return /:\d{2}:\d{2}$/.test(value) ? `${value}Z` : `${value}:00Z`;
}

function europeanAqiCategory(value: number): AirQualityCategory {
  if (value <= 20) return "good";
  if (value <= 40) return "fair";
  if (value <= 60) return "moderate";
  if (value <= 80) return "poor";
  if (value <= 100) return "very_poor";
  return "extremely_poor";
}

function usAqiCategory(value: number): AirQualityCategory {
  if (value <= 50) return "good";
  if (value <= 100) return "moderate";
  if (value <= 150) return "unhealthy_for_sensitive_groups";
  if (value <= 200) return "unhealthy";
  if (value <= 300) return "very_unhealthy";
  return "hazardous";
}

function airQualityIndices(
  europeanAqi: number | null | undefined,
  usAqi: number | null | undefined,
): AirQualityIndex[] {
  return [
    ...(europeanAqi == null
      ? []
      : [
          {
            scale: "european-aqi" as const,
            value: europeanAqi,
            category: europeanAqiCategory(europeanAqi),
          },
        ]),
    ...(usAqi == null
      ? []
      : [
          {
            scale: "us-epa" as const,
            value: usAqi,
            category: usAqiCategory(usAqi),
          },
        ]),
  ];
}

function concentration(value: number | null | undefined) {
  return value == null
    ? undefined
    : {
        value,
        unit: "micrograms_per_cubic_metre" as const,
      };
}

function pollutantSet(values: {
  pm2_5?: number | null | undefined;
  pm10?: number | null | undefined;
  carbon_monoxide?: number | null | undefined;
  nitrogen_dioxide?: number | null | undefined;
  sulphur_dioxide?: number | null | undefined;
  ozone?: number | null | undefined;
}): PollutantSet {
  const particulateMatter2_5 = concentration(values.pm2_5);
  const particulateMatter10 = concentration(values.pm10);
  const carbonMonoxide = concentration(values.carbon_monoxide);
  const nitrogenDioxide = concentration(values.nitrogen_dioxide);
  const sulphurDioxide = concentration(values.sulphur_dioxide);
  const ozone = concentration(values.ozone);

  return {
    ...(particulateMatter2_5 === undefined ? {} : { particulateMatter2_5 }),
    ...(particulateMatter10 === undefined ? {} : { particulateMatter10 }),
    ...(carbonMonoxide === undefined ? {} : { carbonMonoxide }),
    ...(nitrogenDioxide === undefined ? {} : { nitrogenDioxide }),
    ...(sulphurDioxide === undefined ? {} : { sulphurDioxide }),
    ...(ozone === undefined ? {} : { ozone }),
  };
}

function pollenConcentration(value: number | null | undefined) {
  return value == null
    ? undefined
    : { value, unit: "grains_per_cubic_metre" as const };
}

function pollenSet(values: {
  alder_pollen?: number | null | undefined;
  birch_pollen?: number | null | undefined;
  grass_pollen?: number | null | undefined;
  mugwort_pollen?: number | null | undefined;
  olive_pollen?: number | null | undefined;
  ragweed_pollen?: number | null | undefined;
}): PollenSet {
  const entries = [
    ["alder", values.alder_pollen],
    ["birch", values.birch_pollen],
    ["grass", values.grass_pollen],
    ["mugwort", values.mugwort_pollen],
    ["olive", values.olive_pollen],
    ["ragweed", values.ragweed_pollen],
  ] as const;
  return Object.fromEntries(
    entries.flatMap(([name, value]) => {
      const concentration = pollenConcentration(value);
      return concentration === undefined ? [] : [[name, concentration]];
    }),
  );
}

function currentHourlyIndex(
  currentTime: string,
  hourlyTimes: readonly string[],
): number | undefined {
  const currentHour = currentTime.slice(0, 13);
  const matchingHour = hourlyTimes.findIndex(
    (hourlyTime) => hourlyTime.slice(0, 13) === currentHour,
  );
  if (matchingHour >= 0) return matchingHour;

  const currentTimestamp = Date.parse(utcInstant(currentTime));
  if (!Number.isFinite(currentTimestamp) || hourlyTimes.length === 0) {
    return undefined;
  }

  return hourlyTimes.reduce((nearestIndex, hourlyTime, index) => {
    const nearestDistance = Math.abs(
      Date.parse(utcInstant(hourlyTimes[nearestIndex] ?? hourlyTime)) -
        currentTimestamp,
    );
    const distance = Math.abs(
      Date.parse(utcInstant(hourlyTime)) - currentTimestamp,
    );
    return distance < nearestDistance ? index : nearestIndex;
  }, 0);
}

export interface OpenMeteoWeatherOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly descriptor = {
    id: "open-meteo",
    name: "Open-Meteo",
    capabilities: {
      current: true,
      hourly: true,
      daily: true,
      alerts: false,
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
      text: "Weather data by Open-Meteo",
      url: "https://open-meteo.com/",
    },
    dataProfile: {
      weatherSpatial: "grid",
      currentSource: "forecast",
      hourlyGranularity: "hourly",
      dailyGranularity: "native",
      airQualityIntegration: "separate",
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
        source: "separate_api",
        integrated: true,
        detail: "Global current and hourly data from the Air Quality API.",
      },
      pollen: {
        availability: "limited",
        source: "separate_api",
        integrated: true,
        detail: "Hourly CAMS Europe data; available in Europe during pollen season.",
      },
    },
  } as const;

  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #now: () => Date;

  constructor(options: OpenMeteoWeatherOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl = options.baseUrl ?? "https://api.open-meteo.com/v1/forecast";
    this.#now = options.now ?? (() => new Date());
  }

  async getWeather(location: ResolvedLocation, _request: WeatherRequest) {
    const url = new URL(this.#baseUrl);
    url.searchParams.set("latitude", String(location.coordinates.latitude));
    url.searchParams.set("longitude", String(location.coordinates.longitude));
    url.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m",
    );
    url.searchParams.set(
      "hourly",
      "temperature_2m,precipitation_probability,weather_code,uv_index,visibility",
    );
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max",
    );
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("forecast_days", "7");
    url.searchParams.set("forecast_hours", "24");
    url.searchParams.set("wind_speed_unit", "ms");
    if (location.coordinates.elevationMetres !== undefined) {
      url.searchParams.set(
        "elevation",
        String(location.coordinates.elevationMetres),
      );
    }

    const response = await this.#fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo forecast returned ${response.status}`);
    }
    const forecast = OpenMeteoForecastSchema.parse(await response.json());
    const fetchedAt = this.#now();
    const currentHourIndex = currentHourlyIndex(
      forecast.current.time,
      forecast.hourly.time,
    );
    const currentPrecipitationProbability =
      currentHourIndex === undefined
        ? undefined
        : forecast.hourly.precipitation_probability[currentHourIndex];

    return {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: utcInstant(forecast.current.time),
        temperatureCelsius: forecast.current.temperature_2m,
        feelsLikeCelsius: forecast.current.apparent_temperature,
        relativeHumidityPercent: forecast.current.relative_humidity_2m,
        ...(currentPrecipitationProbability === undefined
          ? {}
          : {
              precipitationProbabilityPercent:
                currentPrecipitationProbability,
            }),
        windSpeedMetresPerSecond: forecast.current.wind_speed_10m,
        windDirectionDegrees: forecast.current.wind_direction_10m,
        condition: conditionFor(forecast.current.weather_code),
      },
      hourly: forecast.hourly.time.map((validAt, index) => ({
        validAt: utcInstant(validAt),
        intervalMinutes: 60,
        temperatureCelsius: forecast.hourly.temperature_2m[index] ?? 0,
        precipitationProbabilityPercent:
          forecast.hourly.precipitation_probability[index] ?? 0,
        ...(forecast.hourly.uv_index[index] == null
          ? {}
          : { uvIndex: forecast.hourly.uv_index[index] }),
        ...(forecast.hourly.visibility[index] == null
          ? {}
          : { visibilityMetres: forecast.hourly.visibility[index] }),
        condition: conditionFor(forecast.hourly.weather_code[index] ?? -1),
      })),
      daily: forecast.daily.time.map((date, index) => ({
        date,
        minimumTemperatureCelsius:
          forecast.daily.temperature_2m_min[index] ?? 0,
        maximumTemperatureCelsius:
          forecast.daily.temperature_2m_max[index] ?? 0,
        ...(forecast.daily.sunrise[index] == null
          ? {}
          : { sunriseAt: utcInstant(forecast.daily.sunrise[index]) }),
        ...(forecast.daily.sunset[index] == null
          ? {}
          : { sunsetAt: utcInstant(forecast.daily.sunset[index]) }),
        ...(forecast.daily.uv_index_max[index] == null
          ? {}
          : { maximumUvIndex: forecast.daily.uv_index_max[index] }),
        condition: conditionFor(forecast.daily.weather_code[index] ?? -1),
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

export interface OpenMeteoAirQualityOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
}

export class OpenMeteoAirQualityProvider
  implements AirQualityProvider, PollenProvider
{
  readonly providerId = "open-meteo";

  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #now: () => Date;

  constructor(options: OpenMeteoAirQualityOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl =
      options.baseUrl ?? "https://air-quality-api.open-meteo.com/v1/air-quality";
    this.#now = options.now ?? (() => new Date());
  }

  async getAirQuality(location: ResolvedLocation) {
    return (await this.#getEnvironment(location, true, false)).airQuality;
  }

  async getPollen(location: ResolvedLocation) {
    return (await this.#getEnvironment(location, false, true)).pollen;
  }

  async getAirQualityAndPollen(location: ResolvedLocation) {
    return this.#getEnvironment(location, true, true);
  }

  async #getEnvironment(
    location: ResolvedLocation,
    includeAirQuality: boolean,
    includePollen: boolean,
  ) {
    const url = new URL(this.#baseUrl);
    url.searchParams.set("latitude", String(location.coordinates.latitude));
    url.searchParams.set("longitude", String(location.coordinates.longitude));
    const variables = [
      ...(includeAirQuality
        ? [
            "european_aqi",
            "us_aqi",
            "pm10",
            "pm2_5",
            "carbon_monoxide",
            "nitrogen_dioxide",
            "sulphur_dioxide",
            "ozone",
          ]
        : []),
      ...(includePollen
        ? [
            "alder_pollen",
            "birch_pollen",
            "grass_pollen",
            "mugwort_pollen",
            "olive_pollen",
            "ragweed_pollen",
          ]
        : []),
    ].join(",");
    url.searchParams.set("current", variables);
    url.searchParams.set("hourly", variables);
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("forecast_hours", "24");

    const response = await this.#fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo air quality returned ${response.status}`);
    }

    const environment = OpenMeteoAirQualitySchema.parse(await response.json());
    const fetchedAt = this.#now();
    const hourlyAirQuality = environment.hourly.time.map((validAt, index) => ({
      validAt: utcInstant(validAt),
      intervalMinutes: 60,
      indices: airQualityIndices(
        environment.hourly.european_aqi?.[index],
        environment.hourly.us_aqi?.[index],
      ),
      pollutants: pollutantSet({
        pm10: environment.hourly.pm10?.[index],
        pm2_5: environment.hourly.pm2_5?.[index],
        carbon_monoxide: environment.hourly.carbon_monoxide?.[index],
        nitrogen_dioxide: environment.hourly.nitrogen_dioxide?.[index],
        sulphur_dioxide: environment.hourly.sulphur_dioxide?.[index],
        ozone: environment.hourly.ozone?.[index],
      }),
    }));
    const hourlyPollen = environment.hourly.time.flatMap((validAt, index) => {
      const concentrations = pollenSet({
        alder_pollen: environment.hourly.alder_pollen?.[index],
        birch_pollen: environment.hourly.birch_pollen?.[index],
        grass_pollen: environment.hourly.grass_pollen?.[index],
        mugwort_pollen: environment.hourly.mugwort_pollen?.[index],
        olive_pollen: environment.hourly.olive_pollen?.[index],
        ragweed_pollen: environment.hourly.ragweed_pollen?.[index],
      });
      return Object.keys(concentrations).length === 0
        ? []
        : [{ validAt: utcInstant(validAt), intervalMinutes: 60, concentrations }];
    });
    const currentPollen = pollenSet(environment.current);
    const commonMetadata = {
      providerId: this.providerId,
      fetchedAt: fetchedAt.toISOString(),
      staleAfter: new Date(fetchedAt.getTime() + 24 * 60 * 60_000).toISOString(),
      spatialRepresentation: "grid" as const,
    };
    const airQuality = {
      current: {
        validAt: utcInstant(environment.current.time),
        intervalMinutes: environment.current.interval / 60,
        indices: airQualityIndices(
          environment.current.european_aqi,
          environment.current.us_aqi,
        ),
        pollutants: pollutantSet(environment.current),
      },
      hourly: hourlyAirQuality,
      metadata: {
        ...commonMetadata,
        expiresAt: new Date(fetchedAt.getTime() + 30 * 60_000).toISOString(),
      },
    };
    const pollen = {
      ...(Object.keys(currentPollen).length === 0
        ? {}
        : {
            current: {
              validAt: utcInstant(environment.current.time),
              intervalMinutes: environment.current.interval / 60,
              concentrations: currentPollen,
            },
          }),
      hourly: hourlyPollen,
      metadata: {
        ...commonMetadata,
        expiresAt: new Date(fetchedAt.getTime() + 60 * 60_000).toISOString(),
        modelDomain: "cams_europe",
        nativeResolutionKilometres: 11,
      },
    };
    return { airQuality, pollen };
  }
}
