import { describe, expect, it, vi } from "vitest";

import { WeatherbitProvider, type FetchLike } from "./index.js";

describe("Weatherbit provider", () => {
  it("maps current and daily feeds into canonical resources", async () => {
    const fetch = vi.fn<FetchLike>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/current")) {
        return Response.json({
          data: [
            {
              ts: 1_787_090_400,
              temp: 27,
              app_temp: 28,
              rh: 45,
              wind_spd: 3,
              wind_dir: 190,
              aqi: 50,
              weather: { code: 802 },
            },
          ],
        });
      }
      return Response.json({
        data: [
          {
            valid_date: "2026-08-16",
            min_temp: 16,
            max_temp: 31,
            sunrise_ts: 1_787_047_620,
            sunset_ts: 1_787_099_880,
            uv: 6,
            weather: { code: 804 },
          },
        ],
      });
    });
    const provider = new WeatherbitProvider({
      apiKey: "weatherbit-test-key",
      fetch,
      now: () => new Date("2026-08-16T15:15:00Z"),
    });

    const result = await provider.getWeather(
      {
        id: "test:lutsk",
        displayName: "Lutsk, Ukraine",
        kind: "city",
        coordinates: { latitude: 50.75784, longitude: 25.35024 },
        timezone: "Europe/Kyiv",
      },
      { sections: ["current", "hourly", "daily"] },
    );

    expect(result).toMatchObject({
      current: {
        temperatureCelsius: 27,
        condition: "partly_cloudy",
      },
      daily: [
        {
          date: "2026-08-16",
          maximumUvIndex: 6,
          condition: "cloudy",
        },
      ],
      metadata: { providerId: "weatherbit" },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const requestedUrls = fetch.mock.calls.map(([input]) => new URL(String(input)));
    expect(requestedUrls.map((url) => url.pathname)).toEqual([
      "/v2.0/current",
      "/v2.0/forecast/daily",
    ]);
    expect(requestedUrls[0]?.searchParams.get("key")).toBe(
      "weatherbit-test-key",
    );
  });

  it("maps the bundled current AQI without inventing pollutants or hourly AQ", async () => {
    const fetch = vi.fn<FetchLike>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/current")) {
        return Response.json({
          data: [
            {
              ts: 1_787_090_400,
              temp: 27,
              aqi: 50,
              weather: { code: 802 },
            },
          ],
        });
      }
      return Response.json({
        data: [
          {
            valid_date: "2026-08-16",
            min_temp: 16,
            max_temp: 31,
            weather: { code: 804 },
          },
        ],
      });
    });
    const provider = new WeatherbitProvider({
      apiKey: "weatherbit-test-key",
      fetch,
      now: () => new Date("2026-08-16T15:15:00Z"),
    });

    const result = await provider.getWeatherAndAirQuality(
      {
        id: "test:lutsk",
        displayName: "Lutsk, Ukraine",
        kind: "city",
        coordinates: { latitude: 50.75784, longitude: 25.35024 },
        timezone: "Europe/Kyiv",
      },
      { sections: ["current", "hourly", "daily"] },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(provider.descriptor.capabilities.airQuality).toBe(true);
    expect(result).toMatchObject({
      weather: {
        current: { temperatureCelsius: 27 },
      },
      airQuality: {
        current: {
          validAt: "2026-08-18T22:00:00.000Z",
          indices: [{ scale: "us-epa", value: 50, category: "good" }],
          pollutants: {},
        },
        metadata: {
          providerId: "weatherbit",
          spatialRepresentation: "grid",
        },
      },
    });
    expect("hourly" in result.airQuality).toBe(false);
    expect(result.airQuality.current.pollutants).toEqual({});
  });

  it("keeps pollen disabled when the configured plan cannot access its endpoint", () => {
    const provider = new WeatherbitProvider({
      apiKey: "weatherbit-test-key",
    });

    expect(provider.descriptor.capabilities.pollen).toBe(false);
    expect(provider.descriptor.featureProfile.pollen).toMatchObject({
      availability: "limited",
      source: "separate_api",
      integrated: false,
    });
    expect(provider.descriptor.featureProfile.pollen.detail).toContain(
      "configured plan returns 403",
    );
  });
});
