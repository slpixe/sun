import { describe, expect, it, vi } from "vitest";

import { VisualCrossingWeatherProvider, type FetchLike } from "./index.js";

const location = {
  id: "test:lutsk",
  displayName: "Lutsk, Ukraine",
  kind: "city" as const,
  coordinates: { latitude: 50.75784, longitude: 25.35024 },
  timezone: "Europe/Kyiv",
};

const at = (value: string) => Date.parse(value) / 1_000;

describe("Visual Crossing weather provider", () => {
  it("maps Timeline current, hourly, and daily data", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        currentConditions: {
          datetimeEpoch: at("2026-08-15T10:15:00Z"),
          temp: 24.2,
          feelslike: 24.8,
          humidity: 52,
          windspeed: 18,
          winddir: 180,
          icon: "partly-cloudy-day",
        },
        days: [
          {
            datetime: "2026-08-15",
            tempmin: 17,
            tempmax: 28,
            sunriseEpoch: at("2026-08-15T03:04:00Z"),
            sunsetEpoch: at("2026-08-15T17:42:00Z"),
            uvindex: 5,
            icon: "rain",
            hours: [
              {
                datetimeEpoch: at("2026-08-15T10:00:00Z"),
                temp: 24,
                precipprob: 35,
                visibility: 16,
                uvindex: 3,
                icon: "partly-cloudy-day",
              },
            ],
          },
        ],
      }),
    );
    const provider = new VisualCrossingWeatherProvider({
      apiKey: "visual-test-key",
      fetch,
      now: () => new Date("2026-08-15T10:20:00Z"),
    });

    const result = await provider.getWeather(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(result).toMatchObject({
      current: {
        observedAt: "2026-08-15T10:15:00.000Z",
        temperatureCelsius: 24.2,
        precipitationProbabilityPercent: 35,
        windSpeedMetresPerSecond: 5,
        condition: "partly_cloudy",
      },
      hourly: [
        {
          validAt: "2026-08-15T10:00:00.000Z",
          visibilityMetres: 16_000,
          uvIndex: 3,
        },
      ],
      daily: [
        {
          date: "2026-08-15",
          sunriseAt: "2026-08-15T03:04:00.000Z",
          maximumUvIndex: 5,
          condition: "rain",
        },
      ],
      metadata: { providerId: "visual-crossing" },
    });
    const requested = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requested.pathname).toContain("/50.75784,25.35024/2026-08-15/2026-08-21");
    expect(requested.searchParams.get("unitGroup")).toBe("metric");
    expect(requested.searchParams.get("key")).toBe("visual-test-key");
    expect(requested.searchParams.get("elements")).not.toContain("aqius");
  });

  it("maps weather and air quality from one optional-elements request", async () => {
    const airQuality = {
      pm1: 7,
      pm2p5: 8,
      pm10: 9,
      o3: 78,
      no2: 1,
      so2: 1,
      co: 133,
      aqius: 29,
      aqieur: 2,
    };
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        currentConditions: {
          datetimeEpoch: at("2026-08-17T08:15:00Z"),
          temp: 21.2,
          humidity: 58,
          icon: "clear-day",
          ...airQuality,
        },
        days: [
          {
            datetime: "2026-08-17",
            tempmin: 15,
            tempmax: 27,
            icon: "clear-day",
            hours: [
              {
                datetimeEpoch: at("2026-08-17T08:00:00Z"),
                temp: 21,
                icon: "clear-day",
                ...airQuality,
              },
              {
                datetimeEpoch: at("2026-08-17T09:00:00Z"),
                temp: 22,
                icon: "clear-day",
                pm1: null,
                pm2p5: null,
                pm10: null,
                o3: null,
                no2: null,
                so2: null,
                co: null,
                aqius: null,
                aqieur: null,
              },
            ],
          },
        ],
      }),
    );
    const provider = new VisualCrossingWeatherProvider({
      apiKey: "visual-test-key",
      fetch,
      now: () => new Date("2026-08-17T08:20:00Z"),
    });

    const result = await provider.getWeatherAndAirQuality(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(provider.descriptor.capabilities.airQuality).toBe(true);
    expect(result).toMatchObject({
      weather: {
        current: { temperatureCelsius: 21.2 },
        hourly: [
          { temperatureCelsius: 21 },
          { temperatureCelsius: 22 },
        ],
      },
      airQuality: {
        current: {
          validAt: "2026-08-17T08:15:00.000Z",
          indices: [
            {
              scale: "visual-crossing-european-category",
              value: 2,
              category: "fair",
            },
            { scale: "us-epa", value: 29, category: "good" },
          ],
          pollutants: {
            particulateMatter1: {
              value: 7,
              unit: "micrograms_per_cubic_metre",
            },
            particulateMatter2_5: {
              value: 8,
              unit: "micrograms_per_cubic_metre",
            },
            particulateMatter10: {
              value: 9,
              unit: "micrograms_per_cubic_metre",
            },
            ozone: { value: 78, unit: "micrograms_per_cubic_metre" },
            nitrogenDioxide: {
              value: 1,
              unit: "micrograms_per_cubic_metre",
            },
            sulphurDioxide: {
              value: 1,
              unit: "micrograms_per_cubic_metre",
            },
            carbonMonoxide: {
              value: 133,
              unit: "micrograms_per_cubic_metre",
            },
          },
        },
        hourly: [{ intervalMinutes: 60 }],
        metadata: {
          providerId: "visual-crossing",
          spatialRepresentation: "point",
        },
      },
    });
    expect(result.weather.hourly).toHaveLength(2);
    expect(result.airQuality.hourly).toHaveLength(1);
    const requested = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requested.searchParams.get("elements")?.split(",")).toEqual(
      expect.arrayContaining([
        "temp",
        "pm1",
        "pm2p5",
        "pm10",
        "o3",
        "no2",
        "so2",
        "co",
        "aqius",
        "aqieur",
      ]),
    );
  });
});
