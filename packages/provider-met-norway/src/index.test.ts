import { describe, expect, it, vi } from "vitest";

import { MetNorwayWeatherProvider, type FetchLike } from "./index.js";

const location = {
  id: "open-meteo:3143244",
  displayName: "Oslo, Norway",
  kind: "city" as const,
  coordinates: {
    latitude: 59.9139,
    longitude: 10.7522,
    elevationMetres: 23.6,
  },
  timezone: "UTC",
  countryCode: "NO",
};

const forecast = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [10.75, 59.91, 24] },
  properties: {
    meta: {
      updated_at: "2026-08-15T11:40:00Z",
      units: {},
    },
    timeseries: [
      {
        time: "2026-08-15T10:00:00Z",
        data: {
          instant: {
            details: {
              air_temperature: 10,
              relative_humidity: 70,
              ultraviolet_index_clear_sky: 2,
              wind_from_direction: 90,
              wind_speed: 2,
            },
          },
          next_1_hours: {
            summary: { symbol_code: "fair_day" },
            details: { probability_of_precipitation: 20 },
          },
          next_6_hours: {
            summary: { symbol_code: "partlycloudy_day" },
            details: {
              air_temperature_min: 9,
              air_temperature_max: 15,
            },
          },
        },
      },
      {
        time: "2026-08-15T12:00:00Z",
        data: {
          instant: {
            details: {
              air_temperature: 14,
              ultraviolet_index_clear_sky: 4.2,
            },
          },
          next_1_hours: {
            summary: { symbol_code: "partlycloudy_day" },
            details: { probability_of_precipitation: 30 },
          },
        },
      },
      {
        time: "2026-08-15T18:00:00Z",
        data: {
          instant: { details: { air_temperature: 12 } },
          next_6_hours: {
            summary: { symbol_code: "heavyrain" },
            details: {
              air_temperature_min: 7,
              air_temperature_max: 13,
              probability_of_precipitation: 80,
            },
          },
        },
      },
      {
        time: "2026-08-16T00:00:00Z",
        data: {
          instant: { details: { air_temperature: 8 } },
          next_6_hours: {
            summary: { symbol_code: "clearsky_night" },
            details: {
              air_temperature_min: 6,
              air_temperature_max: 10,
              probability_of_precipitation: 5,
            },
          },
        },
      },
    ],
  },
};

function forecastResponse() {
  return new Response(JSON.stringify(forecast), {
    status: 200,
    headers: {
      "content-type": "application/json",
      expires: "Sat, 15 Aug 2026 12:30:00 GMT",
      "last-modified": "Sat, 15 Aug 2026 11:45:00 GMT",
    },
  });
}

describe("MET Norway weather provider", () => {
  it("maps variable-resolution forecast data into the canonical model", async () => {
    const fetch = vi.fn<FetchLike>(async () => forecastResponse());
    const provider = new MetNorwayWeatherProvider({
      userAgent: "WeatherProject/0.1 https://weatherproject.test/contact",
      fetch,
      now: () => new Date("2026-08-15T12:05:00Z"),
    });

    const result = await provider.getWeather(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      current: {
        observedAt: "2026-08-15T10:00:00Z",
        temperatureCelsius: 10,
        relativeHumidityPercent: 70,
        precipitationProbabilityPercent: 20,
        windSpeedMetresPerSecond: 2,
        windDirectionDegrees: 90,
        condition: "mostly_clear",
      },
      hourly: expect.arrayContaining([
        {
          validAt: "2026-08-15T10:00:00Z",
          intervalMinutes: 120,
          temperatureCelsius: 10,
          precipitationProbabilityPercent: 20,
          uvIndex: 2,
          condition: "mostly_clear",
        },
      ]),
      daily: [
        {
          date: "2026-08-15",
          minimumTemperatureCelsius: 7,
          maximumTemperatureCelsius: 15,
          maximumUvIndex: 4.2,
          condition: "partly_cloudy",
        },
        {
          date: "2026-08-16",
          minimumTemperatureCelsius: 6,
          maximumTemperatureCelsius: 10,
          condition: "clear",
        },
      ],
      metadata: {
        providerId: "met-norway",
        fetchedAt: "2026-08-15T12:05:00.000Z",
        expiresAt: "2026-08-15T12:30:00.000Z",
        staleAfter: "2026-08-16T12:30:00.000Z",
        forecastGeneratedAt: "2026-08-15T11:40:00Z",
        sourceLastModifiedAt: "2026-08-15T11:45:00.000Z",
      },
    });

    const [input, init] = fetch.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe(
      "/weatherapi/locationforecast/2.0/complete",
    );
    expect(url.searchParams.get("lat")).toBe("59.9139");
    expect(url.searchParams.get("lon")).toBe("10.7522");
    expect(url.searchParams.get("altitude")).toBe("24");
    expect(new Headers(init?.headers).get("user-agent")).toBe(
      "WeatherProject/0.1 https://weatherproject.test/contact",
    );
  });

  it("conditionally revalidates an expired canonical response", async () => {
    let currentTime = new Date("2026-08-15T12:05:00Z");
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(forecastResponse())
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: { expires: "Sat, 15 Aug 2026 13:00:00 GMT" },
        }),
      );
    const provider = new MetNorwayWeatherProvider({
      userAgent: "WeatherProject/0.1 https://weatherproject.test/contact",
      fetch,
      now: () => currentTime,
    });
    const first = await provider.getWeather(location, {
      sections: ["current", "hourly", "daily"],
    });
    currentTime = new Date("2026-08-15T12:35:00Z");
    const revalidated = await provider.getWeather(location, {
      sections: ["current", "hourly", "daily"],
      previous: first,
    });

    expect(revalidated.current).toEqual(first.current);
    expect(revalidated.metadata).toMatchObject({
      fetchedAt: "2026-08-15T12:35:00.000Z",
      expiresAt: "2026-08-15T13:00:00.000Z",
      sourceLastModifiedAt: "2026-08-15T11:45:00.000Z",
    });
    expect(
      new Headers(fetch.mock.calls[1]?.[1]?.headers).get(
        "if-modified-since",
      ),
    ).toBe("Sat, 15 Aug 2026 11:45:00 GMT");
  });

  it("requires an identifying User-Agent", () => {
    expect(
      () => new MetNorwayWeatherProvider({ userAgent: "node" }),
    ).toThrow("identifying User-Agent");
  });
});
