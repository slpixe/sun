import { describe, expect, it } from "vitest";

import {
  ProviderDescriptorSchema,
  WeatherQuerySchema,
  WeatherResponseSchema,
} from "./index.js";

describe("ProviderDescriptorSchema", () => {
  it("accepts a coordinate-based provider", () => {
    const result = ProviderDescriptorSchema.safeParse({
      id: "example",
      name: "Example Weather",
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
      attribution: { text: "Example Weather" },
      dataProfile: {
        weatherSpatial: "grid",
        currentSource: "forecast",
        hourlyGranularity: "variable_interval",
        dailyGranularity: "derived",
        airQualityIntegration: "unavailable",
        airQualityCoverage: "unavailable",
      },
      featureProfile: {
        sunriseSunset: {
          availability: "available",
          source: "separate_api",
          integrated: false,
          detail: "Available from a separate astronomy API.",
        },
        uv: {
          availability: "available",
          source: "forecast",
          integrated: true,
          detail: "Hourly UV.",
        },
        visibility: {
          availability: "unavailable",
          source: "forecast",
          integrated: false,
          detail: "No visibility distance.",
        },
        airQuality: {
          availability: "limited",
          source: "separate_api",
          integrated: false,
          detail: "Regional coverage only.",
        },
        pollen: {
          availability: "unavailable",
          source: "separate_api",
          integrated: false,
          detail: "No pollen data.",
        },
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("WeatherQuerySchema", () => {
  it("accepts a valid local timezone and rejects an unknown one", () => {
    expect(
      WeatherQuerySchema.safeParse({
        provider: "met-norway",
        lat: 50.75,
        lon: 25.35,
        timezone: "Europe/Kyiv",
      }).success,
    ).toBe(true);
    expect(
      WeatherQuerySchema.safeParse({
        provider: "met-norway",
        lat: 50.75,
        lon: 25.35,
        timezone: "Atlantis/Nowhere",
      }).success,
    ).toBe(false);
  });

  it("accepts independent AQ and pollen includes without duplicates", () => {
    expect(
      WeatherQuerySchema.parse({ lat: 50.75, lon: 25.35, include: "airQuality,pollen" })
        .include,
    ).toEqual(["airQuality", "pollen"]);
    expect(
      WeatherQuerySchema.safeParse({ lat: 50.75, lon: 25.35, include: "pollen,pollen" })
        .success,
    ).toBe(false);
  });
});

describe("WeatherResponseSchema", () => {
  it("keeps air quality as an independently timestamped optional resource", () => {
    const result = WeatherResponseSchema.safeParse({
      schemaVersion: 1,
      location: {
        id: "coordinates:1,2",
        displayName: "Forecast location",
        kind: "coordinates",
        coordinates: { latitude: 1, longitude: 2 },
        timezone: "UTC",
      },
      airQuality: {
        current: {
          validAt: "2026-08-15T16:00:00Z",
          indices: [
            { scale: "european-aqi", value: 32, category: "fair" },
          ],
          pollutants: {
            particulateMatter2_5: {
              value: 8.1,
              unit: "micrograms_per_cubic_metre",
            },
          },
        },
        metadata: {
          providerId: "open-meteo",
          fetchedAt: "2026-08-15T16:05:00Z",
          expiresAt: "2026-08-15T16:35:00Z",
          staleAfter: "2026-08-16T16:05:00Z",
          spatialRepresentation: "grid",
        },
      },
      pollen: {
        current: {
          validAt: "2026-08-15T16:00:00Z",
          concentrations: {
            grass: { value: 5.4, unit: "grains_per_cubic_metre" },
          },
        },
        metadata: {
          providerId: "open-meteo",
          fetchedAt: "2026-08-15T16:05:00Z",
          expiresAt: "2026-08-15T17:05:00Z",
          staleAfter: "2026-08-16T16:05:00Z",
          spatialRepresentation: "grid",
          modelDomain: "cams_europe",
        },
      },
      metadata: {
        providerId: "open-meteo",
        fetchedAt: "2026-08-15T16:05:00Z",
        expiresAt: "2026-08-15T16:15:00Z",
        staleAfter: "2026-08-16T16:05:00Z",
      },
    });

    expect(result.success).toBe(true);
  });
});
