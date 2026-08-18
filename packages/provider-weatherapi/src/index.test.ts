import { describe, expect, it, vi } from "vitest";

import { WeatherApiProvider, type FetchLike } from "./index.js";

const location = {
  id: "test:lutsk",
  displayName: "Lutsk, Ukraine",
  kind: "city" as const,
  coordinates: { latitude: 50.75784, longitude: 25.35024 },
  timezone: "Europe/Kyiv",
};

const at = (value: string) => Date.parse(value) / 1_000;

describe("WeatherAPI.com provider", () => {
  it("maps forecast data and local astronomy times", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        current: {
          last_updated_epoch: at("2026-08-15T10:15:00Z"),
          temp_c: 25,
          feelslike_c: 25.6,
          humidity: 50,
          wind_kph: 14.4,
          wind_degree: 170,
          condition: { code: 1003 },
        },
        forecast: {
          forecastday: [
            {
              date: "2026-08-15",
              day: {
                maxtemp_c: 29,
                mintemp_c: 17,
                uv: 5,
                condition: { code: 1183 },
              },
              astro: { sunrise: "06:00 AM", sunset: "08:30 PM" },
              hour: [
                {
                  time_epoch: at("2026-08-15T10:00:00Z"),
                  temp_c: 24.8,
                  chance_of_rain: 35,
                  chance_of_snow: 0,
                  uv: 3.2,
                  vis_km: 12,
                  condition: { code: 1180 },
                },
              ],
            },
          ],
        },
      }),
    );
    const provider = new WeatherApiProvider({
      apiKey: "weatherapi-test-key",
      fetch,
      now: () => new Date("2026-08-15T10:20:00Z"),
    });

    const result = await provider.getWeather(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(result).toMatchObject({
      current: {
        temperatureCelsius: 25,
        precipitationProbabilityPercent: 35,
        windSpeedMetresPerSecond: 4,
        condition: "partly_cloudy",
      },
      hourly: [
        {
          visibilityMetres: 12_000,
          uvIndex: 3.2,
          condition: "rain",
        },
      ],
      daily: [
        {
          date: "2026-08-15",
          sunriseAt: "2026-08-15T03:00:00.000Z",
          sunsetAt: "2026-08-15T17:30:00.000Z",
          maximumUvIndex: 5,
          condition: "rain",
        },
      ],
      metadata: { providerId: "weatherapi" },
    });
    const requested = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe("/v1/forecast.json");
    expect(requested.searchParams.get("days")).toBe("7");
    expect(requested.searchParams.get("aqi")).toBe("no");
    expect(requested.searchParams.get("pollen")).toBe("no");
    expect(requested.searchParams.get("key")).toBe("weatherapi-test-key");
  });

  it("maps weather and AQ from one forecast response", async () => {
    const currentAirQuality = {
      co: 201.9,
      no2: 3.2,
      o3: 70.1,
      so2: 1.8,
      pm2_5: 4.1,
      pm10: 6.3,
      "us-epa-index": 2,
      "gb-defra-index": 2,
    };
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        current: {
          last_updated_epoch: at("2026-08-15T10:15:00Z"),
          temp_c: 25,
          condition: { code: 1003 },
          air_quality: currentAirQuality,
        },
        forecast: {
          forecastday: [
            {
              date: "2026-08-15",
              day: {
                maxtemp_c: 29,
                mintemp_c: 17,
                condition: { code: 1003 },
              },
              astro: { sunrise: "06:00 AM", sunset: "08:30 PM" },
              hour: [
                {
                  time_epoch: at("2026-08-15T10:00:00Z"),
                  temp_c: 24.8,
                  condition: { code: 1003 },
                  air_quality: currentAirQuality,
                },
                {
                  time_epoch: at("2026-08-15T11:00:00Z"),
                  temp_c: 25.2,
                  condition: { code: 1000 },
                  air_quality: {
                    ...currentAirQuality,
                    "us-epa-index": 3,
                    "gb-defra-index": 4,
                  },
                },
              ],
            },
          ],
        },
      }),
    );
    const provider = new WeatherApiProvider({
      apiKey: "weatherapi-test-key",
      fetch,
      now: () => new Date("2026-08-15T10:20:00Z"),
    });

    const result = await provider.getWeatherAndAirQuality(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(result).toMatchObject({
      weather: {
        current: { temperatureCelsius: 25 },
        metadata: { providerId: "weatherapi" },
      },
      airQuality: {
        current: {
          indices: [
            {
              scale: "weatherapi-us-epa-category",
              value: 2,
              category: "moderate",
            },
            { scale: "uk-defra", value: 2 },
          ],
          pollutants: {
            particulateMatter2_5: {
              value: 4.1,
              unit: "micrograms_per_cubic_metre",
            },
            nitrogenDioxide: {
              value: 3.2,
              unit: "micrograms_per_cubic_metre",
            },
          },
        },
        hourly: [
          {
            indices: [
              {
                scale: "weatherapi-us-epa-category",
                value: 2,
                category: "moderate",
              },
              { scale: "uk-defra", value: 2 },
            ],
          },
          {
            indices: [
              {
                scale: "weatherapi-us-epa-category",
                value: 3,
                category: "unhealthy_for_sensitive_groups",
              },
              { scale: "uk-defra", value: 4 },
            ],
          },
        ],
        metadata: {
          providerId: "weatherapi",
          spatialRepresentation: "point",
        },
      },
    });
    expect(fetch).toHaveBeenCalledOnce();
    const requested = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requested.searchParams.get("aqi")).toBe("yes");
    expect(requested.searchParams.get("pollen")).toBe("no");
  });

  it("maps weather, AQ, and current/hourly pollen from one forecast response", async () => {
    const airQuality = {
      pm2_5: 4.1,
      "us-epa-index": 2,
      "gb-defra-index": 2,
    };
    const pollen = {
      Hazel: 0,
      Alder: 0,
      Birch: 0,
      Oak: 1.2,
      Grass: 23.51,
      Mugwort: 56.19,
      Ragweed: 24.89,
    };
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        current: {
          last_updated_epoch: at("2026-08-15T10:15:00Z"),
          temp_c: 25,
          condition: { code: 1003 },
          air_quality: airQuality,
          pollen,
        },
        forecast: {
          forecastday: [
            {
              date: "2026-08-15",
              day: {
                maxtemp_c: 29,
                mintemp_c: 17,
                condition: { code: 1003 },
              },
              astro: { sunrise: "06:00 AM", sunset: "08:30 PM" },
              hour: [
                {
                  time_epoch: at("2026-08-15T10:00:00Z"),
                  temp_c: 24.8,
                  condition: { code: 1003 },
                  air_quality: airQuality,
                  pollen: { ...pollen, Grass: 18.4 },
                },
                {
                  time_epoch: at("2026-08-15T11:00:00Z"),
                  temp_c: 25.2,
                  condition: { code: 1000 },
                  air_quality: airQuality,
                  pollen: { ...pollen, Grass: 20.1 },
                },
              ],
            },
          ],
        },
      }),
    );
    const provider = new WeatherApiProvider({
      apiKey: "weatherapi-test-key",
      fetch,
      now: () => new Date("2026-08-15T10:20:00Z"),
    });

    const result = await provider.getWeatherAirQualityAndPollen(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      weather: { current: { temperatureCelsius: 25 } },
      airQuality: { current: { pollutants: { particulateMatter2_5: { value: 4.1 } } } },
      pollen: {
        current: {
          concentrations: {
            hazel: { value: 0, unit: "grains_per_cubic_metre" },
            oak: { value: 1.2, unit: "grains_per_cubic_metre" },
            grass: { value: 23.51, unit: "grains_per_cubic_metre" },
          },
        },
        metadata: {
          providerId: "weatherapi",
          spatialRepresentation: "point",
          expiresAt: "2026-08-15T11:20:00.000Z",
        },
      },
    });
    expect(result.pollen.hourly).toHaveLength(2);
    const requested = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requested.searchParams.get("aqi")).toBe("yes");
    expect(requested.searchParams.get("pollen")).toBe("yes");
  });
});
