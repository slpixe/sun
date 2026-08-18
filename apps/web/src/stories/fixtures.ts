import {
  ProvidersResponseSchema,
  SavedLocationSchema,
  WeatherResponseSchema,
  type ResolvedLocation,
} from "@weather/contracts";

export const mockLocation: ResolvedLocation = {
  id: "mock:london",
  displayName: "London, England, United Kingdom",
  kind: "city",
  coordinates: { latitude: 51.5074, longitude: -0.1278 },
  timezone: "Europe/London",
  countryCode: "GB",
  administrativeArea: "England",
};

export const mockSearchResults: ResolvedLocation[] = [
  mockLocation,
  {
    id: "mock:london-ontario",
    displayName: "London, Ontario, Canada",
    kind: "city",
    coordinates: { latitude: 42.9834, longitude: -81.233 },
    timezone: "America/Toronto",
    countryCode: "CA",
  },
  {
    id: "mock:london-city-airport",
    displayName: "London City Airport, United Kingdom",
    kind: "airport",
    coordinates: { latitude: 51.5053, longitude: 0.0553 },
    timezone: "Europe/London",
    countryCode: "GB",
  },
];

export const mockProviders = ProvidersResponseSchema.parse([
  {
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
      sunriseSunset: { availability: "available", source: "forecast", integrated: true, detail: "Daily sunrise and sunset times." },
      uv: { availability: "available", source: "forecast", integrated: true, detail: "Hourly UV and daily maximum UV." },
      visibility: { availability: "available", source: "forecast", integrated: true, detail: "Hourly visibility distance." },
      airQuality: { availability: "available", source: "separate_api", integrated: true, detail: "Global current and hourly air quality." },
      pollen: { availability: "limited", source: "separate_api", integrated: true, detail: "Seasonal CAMS Europe pollen forecast." },
    },
  },
  {
    id: "met-norway",
    name: "MET Norway",
    capabilities: {
      current: true,
      hourly: true,
      daily: true,
      alerts: true,
      airQuality: false,
      pollen: false,
      historical: false,
    },
    locationRequirements: {
      coordinates: true,
      elevation: true,
      providerLocationKey: false,
    },
    attribution: {
      text: "Weather forecast from MET Norway",
      url: "https://www.met.no/",
    },
    dataProfile: {
      weatherSpatial: "grid",
      currentSource: "forecast",
      hourlyGranularity: "variable_interval",
      dailyGranularity: "derived",
      airQualityIntegration: "unavailable",
      airQualityCoverage: "unavailable",
    },
    featureProfile: {
      sunriseSunset: { availability: "unavailable", source: "derived", integrated: false, detail: "Not supplied by this integration." },
      uv: { availability: "unavailable", source: "forecast", integrated: false, detail: "Not supplied by this integration." },
      visibility: { availability: "unavailable", source: "forecast", integrated: false, detail: "Not supplied by this integration." },
      airQuality: { availability: "unavailable", source: "separate_api", integrated: false, detail: "Separate product." },
      pollen: { availability: "unavailable", source: "separate_api", integrated: false, detail: "Separate product." },
    },
  },
]);

export const mockSelection = SavedLocationSchema.parse({
  location: mockLocation,
  providerId: "open-meteo",
  savedAt: "2026-08-17T11:45:00Z",
});

const conditions = [
  "partly_cloudy",
  "mostly_clear",
  "clear",
  "clear",
  "partly_cloudy",
  "cloudy",
  "drizzle",
  "rain",
  "rain",
  "cloudy",
  "partly_cloudy",
  "clear",
] as const;

const hourly = conditions.map((condition, index) => ({
  validAt: new Date(Date.UTC(2026, 7, 17, 12 + index)).toISOString(),
  intervalMinutes: 60,
  temperatureCelsius: 21.4 + Math.sin(index / 3) * 3.2,
  precipitationProbabilityPercent: [8, 5, 4, 6, 12, 26, 48, 62, 54, 31, 18, 9][index] ?? 0,
  uvIndex: Math.max(0, 5.2 - index * 0.55),
  visibilityMetres: 18_000 - index * 400,
  condition,
}));

const airQualityHourly = hourly.slice(0, 8).map((point, index) => ({
  validAt: point.validAt,
  intervalMinutes: 60,
  indices: [{ scale: "european-aqi", value: 31 + index * 2, category: index < 5 ? "fair" : "moderate" }],
  pollutants: {
    particulateMatter2_5: { value: 7.8 + index * 0.6, unit: "micrograms_per_cubic_metre" },
    particulateMatter10: { value: 12.4 + index * 0.8, unit: "micrograms_per_cubic_metre" },
    nitrogenDioxide: { value: 18.2 + index, unit: "micrograms_per_cubic_metre" },
    ozone: { value: 56 - index, unit: "micrograms_per_cubic_metre" },
  },
}));

const pollenHourly = hourly.slice(0, 8).map((point, index) => ({
  validAt: point.validAt,
  intervalMinutes: 60,
  concentrations: {
    grass: { value: 38 - index * 2.8, unit: "grains_per_cubic_metre" },
    mugwort: { value: 8.4 + index * 0.4, unit: "grains_per_cubic_metre" },
    birch: { value: 2.1, unit: "grains_per_cubic_metre" },
  },
}));

export const mockWeather = WeatherResponseSchema.parse({
  schemaVersion: 1,
  location: mockLocation,
  current: {
    observedAt: "2026-08-17T11:50:00Z",
    temperatureCelsius: 21.4,
    feelsLikeCelsius: 20.8,
    relativeHumidityPercent: 63,
    precipitationProbabilityPercent: 8,
    windSpeedMetresPerSecond: 4.6,
    windDirectionDegrees: 235,
    condition: "partly_cloudy",
  },
  hourly,
  daily: [
    ["2026-08-17", 15.2, 24.1, "partly_cloudy", 5.2, "04:48:00Z", "19:18:00Z"],
    ["2026-08-18", 14.8, 22.6, "rain", 3.8, "04:50:00Z", "19:16:00Z"],
    ["2026-08-19", 13.9, 21.8, "drizzle", 4.4, "04:51:00Z", "19:14:00Z"],
    ["2026-08-20", 14.4, 23.7, "mostly_clear", 5.9, "04:53:00Z", "19:12:00Z"],
    ["2026-08-21", 15.1, 25.3, "clear", 6.1, "04:55:00Z", "19:09:00Z"],
    ["2026-08-22", 16.2, 24.8, "partly_cloudy", 5.3, "04:56:00Z", "19:07:00Z"],
    ["2026-08-23", 15.7, 22.1, "cloudy", 3.7, "04:58:00Z", "19:05:00Z"],
  ].map(([date, minimum, maximum, condition, maximumUvIndex, sunrise, sunset]) => ({
    date,
    minimumTemperatureCelsius: minimum,
    maximumTemperatureCelsius: maximum,
    condition,
    maximumUvIndex,
    sunriseAt: `${date}T${sunrise}`,
    sunsetAt: `${date}T${sunset}`,
  })),
  airQuality: {
    current: airQualityHourly[0],
    hourly: airQualityHourly,
    metadata: {
      providerId: "open-meteo",
      fetchedAt: "2026-08-17T11:55:00Z",
      expiresAt: "2026-08-17T12:55:00Z",
      staleAfter: "2026-08-18T11:55:00Z",
      spatialRepresentation: "grid",
      modelDomain: "CAMS European air quality ensemble",
      nativeResolutionKilometres: 11,
    },
  },
  pollen: {
    current: pollenHourly[0],
    hourly: pollenHourly,
    metadata: {
      providerId: "open-meteo",
      fetchedAt: "2026-08-17T11:55:00Z",
      expiresAt: "2026-08-17T12:55:00Z",
      staleAfter: "2026-08-18T11:55:00Z",
      spatialRepresentation: "grid",
      modelDomain: "CAMS Europe",
      nativeResolutionKilometres: 11,
    },
  },
  metadata: {
    providerId: "open-meteo",
    fetchedAt: "2026-08-17T11:55:00Z",
    expiresAt: "2026-08-17T12:10:00Z",
    staleAfter: "2026-08-18T11:55:00Z",
    forecastGeneratedAt: "2026-08-17T11:45:00Z",
  },
});

export const mockProvider = mockProviders[0]!;
