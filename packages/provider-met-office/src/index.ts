import type {
  WeatherProvider,
  WeatherRequest,
} from "@weather/provider-core";
import type {
  ResolvedLocation,
  WeatherConditionCode,
} from "@weather/weather-domain";
import { z } from "zod";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

const HourlyPointSchema = z.object({
  time: z.iso.datetime({ offset: true }),
  screenTemperature: z.number(),
  feelsLikeTemperature: z.number().optional(),
  screenRelativeHumidity: z.number().min(0).max(100).optional(),
  windSpeed10m: z.number().min(0).optional(),
  windDirectionFrom10m: z.number().min(0).max(360).optional(),
  visibility: z.number().min(0).optional(),
  uvIndex: z.number().min(0).optional(),
  significantWeatherCode: z.number().int().optional(),
  probOfPrecipitation: z.number().min(0).max(100).optional(),
});

const DailyPointSchema = z.object({
  time: z.iso.datetime({ offset: true }),
  dayMaxScreenTemperature: z.number().optional(),
  nightMinScreenTemperature: z.number().optional(),
  maxUvIndex: z.number().min(0).optional(),
  daySignificantWeatherCode: z.number().int().optional(),
  nightSignificantWeatherCode: z.number().int().optional(),
});

function featureCollectionSchema<T extends z.ZodType>(pointSchema: T) {
  return z.object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z.object({
          type: z.literal("Feature"),
          geometry: z.object({
            type: z.literal("Point"),
            coordinates: z.array(z.number()).min(2),
          }),
          properties: z.object({
            requestPointDistance: z.number().min(0).optional(),
            modelRunDate: z.iso.datetime({ offset: true }),
            locationName: z.string().nullable().optional(),
            timeSeries: z.array(pointSchema).min(1),
          }),
        }),
      )
      .min(1),
  });
}

const HourlyForecastSchema = featureCollectionSchema(HourlyPointSchema);
const DailyForecastSchema = featureCollectionSchema(DailyPointSchema);

function conditionFor(code: number | undefined): WeatherConditionCode {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "partly_cloudy";
  if (code === 5 || code === 6) return "fog";
  if (code === 7 || code === 8) return "cloudy";
  if (code === 9 || code === 10 || code === 11 || code === 12) return "rain";
  if (code === 13 || code === 14 || code === 15) return "rain";
  if (code === 16 || code === 17 || code === 18) return "sleet";
  if (code === 19 || code === 20 || code === 21) return "hail";
  if (code === 22 || code === 23 || code === 24) return "snow";
  if (code === 25 || code === 26 || code === 27) return "snow";
  if (code === 28 || code === 29 || code === 30) return "thunderstorm";
  return "unknown";
}

function expiryFor(response: Response, fetchedAt: Date): Date {
  const timestamp = Date.parse(response.headers.get("expires") ?? "");
  return Number.isFinite(timestamp) && timestamp > fetchedAt.getTime()
    ? new Date(timestamp)
    : new Date(fetchedAt.getTime() + 60 * 60_000);
}

function dateInTimeZone(instant: string | number, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export interface MetOfficeWeatherOptions {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
}

export class MetOfficeWeatherProvider implements WeatherProvider {
  readonly descriptor = {
    id: "met-office",
    name: "UK Met Office",
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
      text: "Powered by Met Office data",
      url: "https://www.metoffice.gov.uk/",
    },
    dataProfile: {
      weatherSpatial: "nearest_site",
      currentSource: "forecast",
      hourlyGranularity: "hourly",
      dailyGranularity: "native",
      airQualityIntegration: "unavailable",
      airQualityCoverage: "unavailable",
    },
    featureProfile: {
      sunriseSunset: {
        availability: "unavailable",
        source: "forecast",
        integrated: false,
        detail: "Global Spot does not expose verified sunrise/sunset fields.",
      },
      uv: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Hourly UV and native daily maximum UV.",
      },
      visibility: {
        availability: "available",
        source: "forecast",
        integrated: true,
        detail: "Hourly visibility distance from the nearest forecast site.",
      },
      airQuality: {
        availability: "limited",
        source: "separate_api",
        integrated: false,
        detail: "UK Air Quality Forecast is a separate commercial product.",
      },
      pollen: {
        availability: "limited",
        source: "separate_api",
        integrated: false,
        detail: "UK pollen is a separate commercial regional product.",
      },
    },
  } as const;

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #now: () => Date;

  constructor(options: MetOfficeWeatherOptions) {
    this.#apiKey = options.apiKey.trim();
    if (this.#apiKey.length < 8) {
      throw new Error("Met Office Weather DataHub API key is required");
    }
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseUrl =
      options.baseUrl ??
      "https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point";
    this.#now = options.now ?? (() => new Date());
  }

  async getWeather(location: ResolvedLocation, _request: WeatherRequest) {
    const requestUrl = (period: "hourly" | "daily") => {
      const url = new URL(`${this.#baseUrl}/${period}`);
      url.searchParams.set("latitude", String(location.coordinates.latitude));
      url.searchParams.set("longitude", String(location.coordinates.longitude));
      url.searchParams.set("includeLocationName", "true");
      url.searchParams.set("excludeParameterMetadata", "true");
      return url;
    };
    const requestInit = {
      headers: {
        accept: "application/json",
        apikey: this.#apiKey,
      },
      signal: AbortSignal.timeout(8_000),
    };
    const [hourlyResponse, dailyResponse] = await Promise.all([
      this.#fetch(requestUrl("hourly"), requestInit),
      this.#fetch(requestUrl("daily"), requestInit),
    ]);
    if (!hourlyResponse.ok) {
      throw new Error(`Met Office hourly forecast returned ${hourlyResponse.status}`);
    }
    if (!dailyResponse.ok) {
      throw new Error(`Met Office daily forecast returned ${dailyResponse.status}`);
    }

    const [hourlyForecast, dailyForecast] = await Promise.all([
      hourlyResponse.json().then((value) => HourlyForecastSchema.parse(value)),
      dailyResponse.json().then((value) => DailyForecastSchema.parse(value)),
    ]);
    const hourlyFeature = hourlyForecast.features[0];
    const dailyFeature = dailyForecast.features[0];
    if (hourlyFeature === undefined || dailyFeature === undefined) {
      throw new Error("Met Office returned no forecast site");
    }
    const hourlyPoints = hourlyFeature.properties.timeSeries;
    const currentPoint = hourlyPoints[0];
    if (currentPoint === undefined) {
      throw new Error("Met Office returned no hourly forecast");
    }
    const fetchedAt = this.#now();
    const expiresAt = new Date(
      Math.min(
        expiryFor(hourlyResponse, fetchedAt).getTime(),
        expiryFor(dailyResponse, fetchedAt).getTime(),
      ),
    );
    const staleAfter = new Date(expiresAt.getTime() + 24 * 60 * 60_000);
    const today = dateInTimeZone(fetchedAt.getTime(), location.timezone);
    const [sourceLongitude, sourceLatitude, sourceElevation] =
      hourlyFeature.geometry.coordinates;
    if (sourceLatitude === undefined || sourceLongitude === undefined) {
      throw new Error("Met Office returned an invalid forecast-site location");
    }

    return {
      schemaVersion: 1 as const,
      location,
      current: {
        observedAt: currentPoint.time,
        temperatureCelsius: currentPoint.screenTemperature,
        ...(currentPoint.feelsLikeTemperature === undefined
          ? {}
          : { feelsLikeCelsius: currentPoint.feelsLikeTemperature }),
        ...(currentPoint.screenRelativeHumidity === undefined
          ? {}
          : { relativeHumidityPercent: currentPoint.screenRelativeHumidity }),
        ...(currentPoint.probOfPrecipitation === undefined
          ? {}
          : {
              precipitationProbabilityPercent:
                currentPoint.probOfPrecipitation,
            }),
        ...(currentPoint.windSpeed10m === undefined
          ? {}
          : { windSpeedMetresPerSecond: currentPoint.windSpeed10m }),
        ...(currentPoint.windDirectionFrom10m === undefined
          ? {}
          : { windDirectionDegrees: currentPoint.windDirectionFrom10m }),
        condition: conditionFor(currentPoint.significantWeatherCode),
      },
      hourly: hourlyPoints.slice(0, 24).map((point) => ({
        validAt: point.time,
        intervalMinutes: 60,
        temperatureCelsius: point.screenTemperature,
        ...(point.probOfPrecipitation === undefined
          ? {}
          : {
              precipitationProbabilityPercent: point.probOfPrecipitation,
            }),
        ...(point.uvIndex === undefined ? {} : { uvIndex: point.uvIndex }),
        ...(point.visibility === undefined
          ? {}
          : { visibilityMetres: point.visibility }),
        condition: conditionFor(point.significantWeatherCode),
      })),
      daily: dailyFeature.properties.timeSeries
        .filter((point) => dateInTimeZone(point.time, location.timezone) >= today)
        .flatMap((point) => {
          if (
            point.nightMinScreenTemperature === undefined ||
            point.dayMaxScreenTemperature === undefined
          ) {
            return [];
          }
          return [{
            date: dateInTimeZone(point.time, location.timezone),
            minimumTemperatureCelsius: point.nightMinScreenTemperature,
            maximumTemperatureCelsius: point.dayMaxScreenTemperature,
            ...(point.maxUvIndex === undefined
              ? {}
              : { maximumUvIndex: point.maxUvIndex }),
            condition: conditionFor(
              point.daySignificantWeatherCode ??
                point.nightSignificantWeatherCode,
            ),
          }];
        })
        .slice(0, 7),
      metadata: {
        providerId: this.descriptor.id,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        staleAfter: staleAfter.toISOString(),
        forecastGeneratedAt:
          Date.parse(hourlyFeature.properties.modelRunDate) >=
          Date.parse(dailyFeature.properties.modelRunDate)
            ? hourlyFeature.properties.modelRunDate
            : dailyFeature.properties.modelRunDate,
        sourceLocation: {
          coordinates: {
            latitude: sourceLatitude,
            longitude: sourceLongitude,
            ...(sourceElevation === undefined
              ? {}
              : { elevationMetres: sourceElevation }),
          },
          ...(hourlyFeature.properties.locationName
            ? { displayName: hourlyFeature.properties.locationName }
            : {}),
          ...(hourlyFeature.properties.requestPointDistance === undefined
            ? {}
            : {
                distanceFromRequestedMetres:
                  hourlyFeature.properties.requestPointDistance,
              }),
        },
      },
    };
  }
}
