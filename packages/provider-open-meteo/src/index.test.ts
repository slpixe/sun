import { describe, expect, it, vi } from "vitest";

import {
  OpenMeteoAirQualityProvider,
  OpenMeteoLocationSearchProvider,
  OpenMeteoWeatherProvider,
} from "./index.js";

describe("OpenMeteoLocationSearchProvider", () => {
  it("maps Open-Meteo search results into canonical locations", async () => {
    const fetch = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        Response.json({
        results: [
          {
            id: 2643743,
            name: "London",
            latitude: 51.50853,
            longitude: -0.12574,
            elevation: 25,
            timezone: "Europe/London",
            country_code: "GB",
            country: "United Kingdom",
            admin1: "England",
            feature_code: "PPLC",
            population: 8_900_000,
          },
        ],
        }),
    );
    const provider = new OpenMeteoLocationSearchProvider({ fetch });

    const locations = await provider.search("London", {
      language: "en",
      limit: 8,
    });

    expect(locations).toEqual([
      {
        id: "open-meteo:2643743",
        displayName: "London, England, United Kingdom",
        kind: "city",
        coordinates: {
          latitude: 51.50853,
          longitude: -0.12574,
          elevationMetres: 25,
        },
        timezone: "Europe/London",
        countryCode: "GB",
        administrativeArea: "England",
      },
    ]);

    expect(fetch).toHaveBeenCalledOnce();
    const requestedUrl = String(fetch.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("name=London");
    expect(requestedUrl).toContain("count=8");
  });

  it("returns an empty list when the provider has no matches", async () => {
    const provider = new OpenMeteoLocationSearchProvider({
      fetch: async () => Response.json({}),
    });

    await expect(
      provider.search("Not a place", { language: "en", limit: 8 }),
    ).resolves.toEqual([]);
  });

  it("labels and ranks populated places ahead of airports", async () => {
    const provider = new OpenMeteoLocationSearchProvider({
      fetch: async () =>
        Response.json({
          results: [
            {
              id: 2,
              name: "Lutsk",
              latitude: 50.78944,
              longitude: 25.34806,
              timezone: "Europe/Kyiv",
              country: "Ukraine",
              admin1: "Volyn Oblast",
              feature_code: "AIRP",
            },
            {
              id: 1,
              name: "Lutsk",
              latitude: 50.75784,
              longitude: 25.35024,
              timezone: "Europe/Kyiv",
              country: "Ukraine",
              admin1: "Volyn Oblast",
              feature_code: "PPLA",
              population: 215_986,
            },
          ],
        }),
    });

    const locations = await provider.search("lutsk", {
      language: "en",
      limit: 8,
    });

    expect(locations.map(({ displayName, kind }) => ({ displayName, kind })))
      .toEqual([
        {
          displayName: "Lutsk, Volyn Oblast, Ukraine",
          kind: "city",
        },
        {
          displayName: "Lutsk Airport, Volyn Oblast, Ukraine",
          kind: "airport",
        },
      ]);
  });
});

describe("OpenMeteoWeatherProvider", () => {
  it("maps one bundled forecast response into the shared schema", async () => {
    const fetch = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        Response.json({
        current: {
          time: "2026-08-15T15:45",
          temperature_2m: 26.9,
          apparent_temperature: 24.3,
          relative_humidity_2m: 30,
          weather_code: 0,
          wind_speed_10m: 3.9,
          wind_direction_10m: 158,
        },
        hourly: {
          time: ["2026-08-15T16:00"],
          temperature_2m: [26.8],
          precipitation_probability: [4],
          uv_index: [1.35],
          visibility: [35_200],
          weather_code: [2],
        },
        daily: {
          time: ["2026-08-15"],
          weather_code: [3],
          temperature_2m_max: [27.4],
          temperature_2m_min: [15.9],
          sunrise: ["2026-08-15T03:06"],
          sunset: ["2026-08-15T17:39"],
          uv_index_max: [5.8],
        },
        }),
    );
    const provider = new OpenMeteoWeatherProvider({
      fetch,
      now: () => new Date("2026-08-15T15:50:00Z"),
    });

    const weather = await provider.getWeather(
      {
        id: "open-meteo:1",
        displayName: "Lutsk, Volyn Oblast, Ukraine",
        kind: "city",
        coordinates: { latitude: 50.75784, longitude: 25.35024 },
        timezone: "Europe/Kyiv",
      },
      { sections: ["current", "hourly", "daily"] },
    );

    expect(weather.current).toMatchObject({
      observedAt: "2026-08-15T15:45:00Z",
      temperatureCelsius: 26.9,
      precipitationProbabilityPercent: 4,
      condition: "clear",
    });
    expect(weather.hourly?.[0]).toMatchObject({
      validAt: "2026-08-15T16:00:00Z",
      uvIndex: 1.35,
      visibilityMetres: 35_200,
      condition: "partly_cloudy",
    });
    expect(weather.daily?.[0]).toMatchObject({
      date: "2026-08-15",
      sunriseAt: "2026-08-15T03:06:00Z",
      sunsetAt: "2026-08-15T17:39:00Z",
      maximumUvIndex: 5.8,
      condition: "cloudy",
    });
    expect(weather.metadata.expiresAt).toBe("2026-08-15T16:00:00.000Z");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("forecast_hours=24");
  });
});

describe("OpenMeteoAirQualityProvider", () => {
  it("maps current and hourly air quality with explicit scales and units", async () => {
    const fetch = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        Response.json({
        current: {
          time: "2026-08-15T16:00",
          interval: 3_600,
          european_aqi: 32,
          us_aqi: 58,
          pm10: 14.2,
          pm2_5: 8.1,
          carbon_monoxide: 201,
          nitrogen_dioxide: 12.4,
          sulphur_dioxide: 2.1,
          ozone: 71,
        },
        hourly: {
          time: ["2026-08-15T16:00", "2026-08-15T17:00"],
          european_aqi: [32, 41],
          us_aqi: [58, 66],
          pm10: [14.2, 15.1],
          pm2_5: [8.1, 8.9],
          carbon_monoxide: [201, 205],
          nitrogen_dioxide: [12.4, 13.2],
          sulphur_dioxide: [2.1, 2.3],
          ozone: [71, 69],
        },
        }),
    );
    const provider = new OpenMeteoAirQualityProvider({
      fetch,
      now: () => new Date("2026-08-15T16:05:00Z"),
    });

    const result = await provider.getAirQuality({
      id: "open-meteo:1",
      displayName: "Lutsk, Volyn Oblast, Ukraine",
      kind: "city",
      coordinates: { latitude: 50.75784, longitude: 25.35024 },
      timezone: "Europe/Kyiv",
    });

    expect(result.current).toMatchObject({
      validAt: "2026-08-15T16:00:00Z",
      intervalMinutes: 60,
      indices: [
        { scale: "european-aqi", value: 32, category: "fair" },
        { scale: "us-epa", value: 58, category: "moderate" },
      ],
      pollutants: {
        particulateMatter2_5: {
          value: 8.1,
          unit: "micrograms_per_cubic_metre",
        },
      },
    });
    expect(result.hourly).toHaveLength(2);
    expect(result.metadata).toMatchObject({
      providerId: "open-meteo",
      expiresAt: "2026-08-15T16:35:00.000Z",
      spatialRepresentation: "grid",
    });
    expect(String(fetch.mock.calls[0]?.[0])).toContain("forecast_hours=24");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("european_aqi");
  });

  it("maps pollen and shares one request when AQ and pollen are requested together", async () => {
    const fetch = vi.fn(
      async (_input: string | URL, _init?: RequestInit) => Response.json({
        current: {
          time: "2026-08-15T16:00",
          interval: 3_600,
          european_aqi: 32,
          us_aqi: 58,
          pm10: 14.2,
          pm2_5: 8.1,
          carbon_monoxide: 201,
          nitrogen_dioxide: 12.4,
          sulphur_dioxide: 2.1,
          ozone: 71,
          alder_pollen: null,
          birch_pollen: null,
          grass_pollen: 5.4,
          mugwort_pollen: 1.2,
          olive_pollen: 0,
          ragweed_pollen: 3.1,
        },
        hourly: {
          time: ["2026-08-15T16:00", "2026-08-15T17:00"],
          european_aqi: [32, 33],
          us_aqi: [58, 59],
          pm10: [14.2, 14.5],
          pm2_5: [8.1, 8.3],
          carbon_monoxide: [201, 202],
          nitrogen_dioxide: [12.4, 12.7],
          sulphur_dioxide: [2.1, 2.2],
          ozone: [71, 70],
          alder_pollen: [null, null],
          birch_pollen: [null, null],
          grass_pollen: [5.4, 4.8],
          mugwort_pollen: [1.2, 1.1],
          olive_pollen: [0, 0],
          ragweed_pollen: [3.1, 3.5],
        },
      }),
    );
    const provider = new OpenMeteoAirQualityProvider({
      fetch,
      now: () => new Date("2026-08-15T16:05:00Z"),
    });

    const result = await provider.getAirQualityAndPollen({
      id: "open-meteo:1",
      displayName: "Lutsk, Volyn Oblast, Ukraine",
      kind: "city",
      coordinates: { latitude: 50.75784, longitude: 25.35024 },
      timezone: "Europe/Kyiv",
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toContain("european_aqi");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("grass_pollen");
    expect(result.pollen.current).toMatchObject({
      validAt: "2026-08-15T16:00:00Z",
      concentrations: {
        grass: { value: 5.4, unit: "grains_per_cubic_metre" },
        ragweed: { value: 3.1, unit: "grains_per_cubic_metre" },
      },
    });
    expect(result.pollen.hourly).toHaveLength(2);
    expect(result.pollen.metadata).toMatchObject({
      providerId: "open-meteo",
      modelDomain: "cams_europe",
      nativeResolutionKilometres: 11,
      expiresAt: "2026-08-15T17:05:00.000Z",
    });
  });
});
