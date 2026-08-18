import { z } from "zod";

export const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevationMetres: z.number().optional(),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const LocationKindSchema = z.enum([
  "city",
  "town",
  "village",
  "airport",
  "postcode",
  "point_of_interest",
  "coordinates",
  "other",
]);

export type LocationKind = z.infer<typeof LocationKindSchema>;

export const ResolvedLocationSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  kind: LocationKindSchema,
  coordinates: CoordinatesSchema,
  timezone: z.string().min(1),
  countryCode: z.string().length(2).optional(),
  administrativeArea: z.string().optional(),
});

export type ResolvedLocation = z.infer<typeof ResolvedLocationSchema>;

export const WeatherConditionCodeSchema = z.enum([
  "clear",
  "mostly_clear",
  "partly_cloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "sleet",
  "snow",
  "hail",
  "thunderstorm",
  "unknown",
]);

export type WeatherConditionCode = z.infer<
  typeof WeatherConditionCodeSchema
>;

export const InstantSchema = z.iso.datetime({ offset: true });

export const CurrentWeatherSchema = z.object({
  observedAt: InstantSchema,
  temperatureCelsius: z.number(),
  feelsLikeCelsius: z.number().optional(),
  relativeHumidityPercent: z.number().min(0).max(100).optional(),
  precipitationProbabilityPercent: z.number().min(0).max(100).optional(),
  windSpeedMetresPerSecond: z.number().min(0).optional(),
  windDirectionDegrees: z.number().min(0).max(360).optional(),
  condition: WeatherConditionCodeSchema.optional(),
});

export type CurrentWeather = z.infer<typeof CurrentWeatherSchema>;

export const HourlyWeatherPointSchema = z.object({
  validAt: InstantSchema,
  intervalMinutes: z.number().int().positive().optional(),
  temperatureCelsius: z.number(),
  precipitationProbabilityPercent: z.number().min(0).max(100).optional(),
  uvIndex: z.number().min(0).optional(),
  visibilityMetres: z.number().min(0).optional(),
  condition: WeatherConditionCodeSchema.optional(),
});

export type HourlyWeatherPoint = z.infer<typeof HourlyWeatherPointSchema>;

export const DailyWeatherPointSchema = z.object({
  date: z.iso.date(),
  minimumTemperatureCelsius: z.number(),
  maximumTemperatureCelsius: z.number(),
  sunriseAt: InstantSchema.optional(),
  sunsetAt: InstantSchema.optional(),
  maximumUvIndex: z.number().min(0).optional(),
  condition: WeatherConditionCodeSchema.optional(),
});

export type DailyWeatherPoint = z.infer<typeof DailyWeatherPointSchema>;

export const AirQualityIndexScaleSchema = z.enum([
  "us-epa",
  "european-aqi",
  "uk-defra",
  "eu-caqi",
  "canadian-aqhi",
  "openweather-1-5",
  "weatherapi-us-epa-category",
  "visual-crossing-european-category",
  "provider-specific",
]);

export type AirQualityIndexScale = z.infer<
  typeof AirQualityIndexScaleSchema
>;

export const AirQualityCategorySchema = z.enum([
  "good",
  "fair",
  "moderate",
  "poor",
  "very_poor",
  "extremely_poor",
  "unhealthy_for_sensitive_groups",
  "unhealthy",
  "very_unhealthy",
  "hazardous",
  "unknown",
]);

export type AirQualityCategory = z.infer<typeof AirQualityCategorySchema>;

export const AirQualityIndexSchema = z.object({
  scale: AirQualityIndexScaleSchema,
  value: z.number().min(0),
  category: AirQualityCategorySchema.optional(),
});

export type AirQualityIndex = z.infer<typeof AirQualityIndexSchema>;

export const ConcentrationUnitSchema = z.enum([
  "micrograms_per_cubic_metre",
  "parts_per_billion",
  "parts_per_million",
]);

export type ConcentrationUnit = z.infer<typeof ConcentrationUnitSchema>;

export const PollutantConcentrationSchema = z.object({
  value: z.number().min(0),
  unit: ConcentrationUnitSchema,
});

export type PollutantConcentration = z.infer<
  typeof PollutantConcentrationSchema
>;

export const PollutantSetSchema = z.object({
  particulateMatter1: PollutantConcentrationSchema.optional(),
  particulateMatter2_5: PollutantConcentrationSchema.optional(),
  particulateMatter10: PollutantConcentrationSchema.optional(),
  carbonMonoxide: PollutantConcentrationSchema.optional(),
  nitrogenMonoxide: PollutantConcentrationSchema.optional(),
  nitrogenDioxide: PollutantConcentrationSchema.optional(),
  sulphurDioxide: PollutantConcentrationSchema.optional(),
  ozone: PollutantConcentrationSchema.optional(),
  ammonia: PollutantConcentrationSchema.optional(),
});

export type PollutantSet = z.infer<typeof PollutantSetSchema>;

export const AirQualityPointSchema = z.object({
  validAt: InstantSchema,
  intervalMinutes: z.number().int().positive().optional(),
  indices: z.array(AirQualityIndexSchema),
  pollutants: PollutantSetSchema,
});

export type AirQualityPoint = z.infer<typeof AirQualityPointSchema>;

export const PollenConcentrationSchema = z.object({
  value: z.number().min(0),
  unit: z.literal("grains_per_cubic_metre"),
});

export const PollenSetSchema = z.object({
  hazel: PollenConcentrationSchema.optional(),
  alder: PollenConcentrationSchema.optional(),
  birch: PollenConcentrationSchema.optional(),
  oak: PollenConcentrationSchema.optional(),
  grass: PollenConcentrationSchema.optional(),
  mugwort: PollenConcentrationSchema.optional(),
  olive: PollenConcentrationSchema.optional(),
  ragweed: PollenConcentrationSchema.optional(),
});

export type PollenSet = z.infer<typeof PollenSetSchema>;

export const PollenPointSchema = z.object({
  validAt: InstantSchema,
  intervalMinutes: z.number().int().positive().optional(),
  concentrations: PollenSetSchema,
});

export type PollenPoint = z.infer<typeof PollenPointSchema>;

export const SpatialRepresentationSchema = z.enum([
  "point",
  "grid",
  "nearest_site",
  "station",
  "administrative_area",
  "region",
]);

export type SpatialRepresentation = z.infer<
  typeof SpatialRepresentationSchema
>;
