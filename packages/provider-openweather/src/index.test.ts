import { describe, expect, it, vi } from "vitest";

import {
  OpenWeatherAirQualityProvider,
  OpenWeatherProvider,
  type FetchLike,
} from "./index.js";

const location = {
  id: "test:lutsk",
  displayName: "Lutsk, Ukraine",
  kind: "city" as const,
  coordinates: { latitude: 50.75784, longitude: 25.35024 },
  timezone: "Europe/Kyiv",
};

const at = (value: string) => Date.parse(value) / 1_000;

describe("OpenWeather provider", () => {
  it("maps standard current and 3-hour forecasts without implying hourly data", async () => {
    const fetch = vi.fn<FetchLike>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/weather")) {
        return Response.json({
          dt: at("2026-08-15T10:15:00Z"),
          main: { temp: 23.4, feels_like: 24, humidity: 58 },
          wind: { speed: 4.2, deg: 225 },
          weather: [{ id: 801 }],
          sys: {
            sunrise: at("2026-08-15T03:04:00Z"),
            sunset: at("2026-08-15T17:42:00Z"),
          },
        });
      }
      return Response.json({
        list: [
          {
            dt: at("2026-08-15T12:00:00Z"),
            main: { temp: 23.2, temp_min: 22, temp_max: 24 },
            pop: 0.42,
            visibility: 10_000,
            weather: [{ id: 500 }],
          },
          {
            dt: at("2026-08-15T15:00:00Z"),
            main: { temp: 25, temp_min: 24, temp_max: 26 },
            pop: 0.1,
            visibility: 9_000,
            weather: [{ id: 802 }],
          },
          {
            dt: at("2026-08-16T00:00:00Z"),
            main: { temp: 17, temp_min: 16, temp_max: 18 },
            pop: 0.05,
            visibility: 10_000,
            weather: [{ id: 800 }],
          },
        ],
      });
    });
    const provider = new OpenWeatherProvider({
      apiKey: "openweather-test-key",
      fetch,
      now: () => new Date("2026-08-15T10:20:00Z"),
    });

    const result = await provider.getWeather(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(result).toMatchObject({
      current: {
        temperatureCelsius: 23.4,
        precipitationProbabilityPercent: 42,
        condition: "mostly_clear",
      },
      hourly: [
        {
          validAt: "2026-08-15T12:00:00.000Z",
          intervalMinutes: 180,
          precipitationProbabilityPercent: 42,
          condition: "rain",
          visibilityMetres: 10_000,
        },
        {
          validAt: "2026-08-15T15:00:00.000Z",
          intervalMinutes: 180,
        },
        {
          validAt: "2026-08-16T00:00:00.000Z",
          intervalMinutes: 180,
        },
      ],
      daily: [
        {
          date: "2026-08-15",
          minimumTemperatureCelsius: 22,
          maximumTemperatureCelsius: 26,
          sunriseAt: "2026-08-15T03:04:00.000Z",
          condition: "rain",
        },
        {
          date: "2026-08-16",
          minimumTemperatureCelsius: 16,
          maximumTemperatureCelsius: 18,
          condition: "clear",
        },
      ],
      metadata: { providerId: "openweather" },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const requestedPaths = fetch.mock.calls.map(([input]) =>
      new URL(String(input)).pathname,
    );
    expect(requestedPaths).toEqual([
      "/data/2.5/weather",
      "/data/2.5/forecast",
    ]);
    for (const [input] of fetch.mock.calls) {
      const requested = new URL(String(input));
      expect(requested.searchParams.get("units")).toBe("metric");
      expect(requested.searchParams.get("appid")).toBe(
        "openweather-test-key",
      );
    }
  });

  it("maps current and forecast air pollution with the provider AQI scale", async () => {
    const currentPoint = {
      dt: at("2026-08-15T10:00:00Z"),
      main: { aqi: 2 },
      components: {
        co: 211.95,
        no: 0.12,
        no2: 3.43,
        o3: 71.53,
        so2: 1.79,
        pm2_5: 4.12,
        pm10: 6.31,
        nh3: 2.38,
      },
    };
    const fetch = vi.fn<FetchLike>(async (input) => {
      const url = new URL(String(input));
      return Response.json({
        list: url.pathname.endsWith("/forecast")
          ? [
              currentPoint,
              {
                ...currentPoint,
                dt: at("2026-08-15T11:00:00Z"),
                main: { aqi: 3 },
              },
            ]
          : [currentPoint],
      });
    });
    const provider = new OpenWeatherAirQualityProvider({
      apiKey: "openweather-test-key",
      fetch,
      now: () => new Date("2026-08-15T10:20:00Z"),
    });

    const result = await provider.getAirQuality(location);

    expect(result).toMatchObject({
      current: {
        validAt: "2026-08-15T10:00:00.000Z",
        indices: [
          { scale: "openweather-1-5", value: 2, category: "fair" },
        ],
        pollutants: {
          particulateMatter2_5: {
            value: 4.12,
            unit: "micrograms_per_cubic_metre",
          },
          nitrogenMonoxide: {
            value: 0.12,
            unit: "micrograms_per_cubic_metre",
          },
          ammonia: {
            value: 2.38,
            unit: "micrograms_per_cubic_metre",
          },
        },
      },
      hourly: [
        { indices: [{ value: 2, category: "fair" }] },
        { indices: [{ value: 3, category: "moderate" }] },
      ],
      metadata: {
        providerId: "openweather",
        spatialRepresentation: "grid",
      },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.map(([input]) => new URL(String(input)).pathname),
    ).toEqual([
      "/data/2.5/air_pollution",
      "/data/2.5/air_pollution/forecast",
    ]);
  });
});
