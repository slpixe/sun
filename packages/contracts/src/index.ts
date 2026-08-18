import {
  AirQualityPointSchema,
  CoordinatesSchema,
  CurrentWeatherSchema,
  DailyWeatherPointSchema,
  HourlyWeatherPointSchema,
  InstantSchema,
  PollenPointSchema,
  ResolvedLocationSchema,
  SpatialRepresentationSchema,
} from "@weather/weather-domain";
import { z } from "zod";

export * from "@weather/weather-domain";

export const ProviderCapabilitiesSchema = z.object({
  current: z.boolean(),
  hourly: z.boolean(),
  daily: z.boolean(),
  alerts: z.boolean(),
  airQuality: z.boolean(),
  pollen: z.boolean(),
  historical: z.boolean(),
});

export const ProviderDataProfileSchema = z.object({
  weatherSpatial: SpatialRepresentationSchema,
  currentSource: z.enum(["observation", "forecast"]),
  hourlyGranularity: z.enum([
    "hourly",
    "three_hourly",
    "variable_interval",
    "unavailable",
  ]),
  dailyGranularity: z.enum(["native", "derived"]),
  airQualityIntegration: z.enum(["bundled", "separate", "unavailable"]),
  airQualityCoverage: z.enum(["global", "regional", "unavailable"]),
});

export const ProviderFeatureSchema = z.object({
  availability: z.enum(["available", "limited", "unavailable"]),
  source: z.enum(["forecast", "separate_api", "derived"]),
  integrated: z.boolean(),
  detail: z.string().min(1),
});

export const ProviderFeatureProfileSchema = z.object({
  sunriseSunset: ProviderFeatureSchema,
  uv: ProviderFeatureSchema,
  visibility: ProviderFeatureSchema,
  airQuality: ProviderFeatureSchema,
  pollen: ProviderFeatureSchema,
});

export const ProviderDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capabilities: ProviderCapabilitiesSchema,
  locationRequirements: z.object({
    coordinates: z.boolean(),
    elevation: z.boolean(),
    providerLocationKey: z.boolean(),
  }),
  attribution: z.object({
    text: z.string().min(1),
    url: z.url().optional(),
  }),
  dataProfile: ProviderDataProfileSchema.optional(),
  featureProfile: ProviderFeatureProfileSchema.optional(),
});

export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;

export const LocationSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}$/)
    .default("en"),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export type LocationSearchQuery = z.infer<typeof LocationSearchQuerySchema>;

export const LocationSearchResponseSchema = z.object({
  results: z.array(ResolvedLocationSchema),
});

export type LocationSearchResponse = z.infer<
  typeof LocationSearchResponseSchema
>;

export const WeatherQuerySchema = z.object({
  provider: z.string().trim().min(1).default("open-meteo"),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  elevation: z.coerce.number().optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("UTC")
    .refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone"),
  include: z
    .string()
    .trim()
    .default("")
    .transform((value) =>
      value === ""
        ? []
        : value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== ""),
    )
    .pipe(z.array(z.enum(["airQuality", "pollen"])).max(2))
    .refine((items) => new Set(items).size === items.length, {
      message: "Include values must be unique",
    }),
});

export type WeatherQuery = z.infer<typeof WeatherQuerySchema>;

export const SavedLocationSchema = z.object({
  location: ResolvedLocationSchema,
  providerId: z.string().min(1),
  savedAt: InstantSchema,
});

export type SavedLocation = z.infer<typeof SavedLocationSchema>;

export const WeatherMetadataSchema = z.object({
  providerId: z.string().min(1),
  fetchedAt: InstantSchema,
  expiresAt: InstantSchema,
  staleAfter: InstantSchema,
  forecastGeneratedAt: InstantSchema.optional(),
  sourceLastModifiedAt: InstantSchema.optional(),
  sourceLocation: z
    .object({
      coordinates: CoordinatesSchema,
      displayName: z.string().min(1).optional(),
      distanceFromRequestedMetres: z.number().min(0).optional(),
    })
    .optional(),
});

export const AirQualityMetadataSchema = z.object({
  providerId: z.string().min(1),
  fetchedAt: InstantSchema,
  expiresAt: InstantSchema,
  staleAfter: InstantSchema,
  spatialRepresentation: SpatialRepresentationSchema,
  modelDomain: z.string().min(1).optional(),
  nativeResolutionKilometres: z.number().positive().optional(),
});

export const AirQualityResourceSchema = z.object({
  current: AirQualityPointSchema.optional(),
  hourly: z.array(AirQualityPointSchema).optional(),
  metadata: AirQualityMetadataSchema,
});

export type AirQualityResource = z.infer<typeof AirQualityResourceSchema>;

export const PollenMetadataSchema = z.object({
  providerId: z.string().min(1),
  fetchedAt: InstantSchema,
  expiresAt: InstantSchema,
  staleAfter: InstantSchema,
  spatialRepresentation: SpatialRepresentationSchema,
  modelDomain: z.string().min(1).optional(),
  nativeResolutionKilometres: z.number().positive().optional(),
});

export const PollenResourceSchema = z.object({
  current: PollenPointSchema.optional(),
  hourly: z.array(PollenPointSchema).optional(),
  metadata: PollenMetadataSchema,
});

export type PollenResource = z.infer<typeof PollenResourceSchema>;

export const ResourceFailureSchema = z.object({
  resource: z.enum(["airQuality", "pollen"]),
  code: z.enum(["unsupported", "provider_unavailable"]),
  message: z.string().min(1),
});

export type ResourceFailure = z.infer<typeof ResourceFailureSchema>;

export const WeatherResponseSchema = z.object({
  schemaVersion: z.literal(1),
  location: ResolvedLocationSchema,
  current: CurrentWeatherSchema.optional(),
  hourly: z.array(HourlyWeatherPointSchema).optional(),
  daily: z.array(DailyWeatherPointSchema).optional(),
  airQuality: AirQualityResourceSchema.optional(),
  pollen: PollenResourceSchema.optional(),
  partialFailures: z.array(ResourceFailureSchema).optional(),
  metadata: WeatherMetadataSchema,
});

export type WeatherResponse = z.infer<typeof WeatherResponseSchema>;

export const ProvidersResponseSchema = z.array(ProviderDescriptorSchema);
