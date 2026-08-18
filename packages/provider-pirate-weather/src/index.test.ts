import { describe, expect, it, vi } from "vitest";

import { PirateWeatherProvider, type FetchLike } from "./index.js";

const at = (value: string) => Date.parse(value) / 1_000;

describe("Pirate Weather provider", () => {
  it("maps a version 2 SI forecast and keeps the key out of the URL", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        currently: {
          time: at("2026-08-16T15:00:00Z"),
          temperature: 30,
          apparentTemperature: 31,
          humidity: 0.42,
          precipProbability: 0.2,
          windSpeed: 3,
          windBearing: 210,
          icon: "partly-cloudy-day",
        },
        hourly: {
          data: [
            {
              time: at("2026-08-16T15:00:00Z"),
              temperature: 30,
              precipProbability: 0.25,
              uvIndex: 2.4,
              visibility: 16,
              icon: "rain",
            },
          ],
        },
        daily: {
          data: [
            {
              time: at("2026-08-16T00:00:00Z"),
              temperatureMin: 16,
              temperatureMax: 31,
              sunriseTime: at("2026-08-16T03:07:00Z"),
              sunsetTime: at("2026-08-16T17:38:00Z"),
              uvIndex: 6,
              icon: "clear-day",
            },
          ],
        },
      }),
    );
    const provider = new PirateWeatherProvider({
      apiKey: "pirate-test-key",
      fetch,
      now: () => new Date("2026-08-16T15:05:00Z"),
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
        relativeHumidityPercent: 42,
        precipitationProbabilityPercent: 20,
        condition: "partly_cloudy",
      },
      hourly: [
        {
          precipitationProbabilityPercent: 25,
          visibilityMetres: 16_000,
          condition: "rain",
        },
      ],
      daily: [
        {
          date: "2026-08-16",
          maximumUvIndex: 6,
          condition: "clear",
        },
      ],
      metadata: { providerId: "pirate-weather" },
    });
    const [input, init] = fetch.mock.calls[0] ?? [];
    const requested = new URL(String(input));
    expect(requested.pathname).toContain("/forecast/weather/50.75784,25.35024");
    expect(requested.href).not.toContain("pirate-test-key");
    expect(requested.searchParams.get("include")).toBeNull();
    expect(new Headers(init?.headers).get("apikey")).toBe("pirate-test-key");
  });

  it("maps weather and SI air quality from one Forecast v2 request", async () => {
    const weather = {
      temperature: 30,
      humidity: 0.42,
      precipProbability: 0.2,
      windSpeed: 3,
      windBearing: 210,
      icon: "partly-cloudy-day",
    };
    const airQuality = {
      airQualityIndex: 36,
      pm25: 11.8,
      pm10: 14.6,
      ozoneConcentration: 42.8,
      no2Concentration: 0.6,
      so2Concentration: 0.5,
      coConcentration: 149,
    };
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        currently: {
          time: at("2026-08-16T15:00:00Z"),
          ...weather,
          ...airQuality,
        },
        hourly: {
          data: [
            {
              time: at("2026-08-16T15:00:00Z"),
              ...weather,
              ...airQuality,
            },
          ],
        },
        daily: {
          data: [
            {
              time: at("2026-08-16T00:00:00Z"),
              temperatureMin: 16,
              temperatureMax: 31,
              icon: "clear-day",
            },
          ],
        },
      }),
    );
    const provider = new PirateWeatherProvider({
      apiKey: "pirate-test-key",
      fetch,
      now: () => new Date("2026-08-16T15:05:00Z"),
    });
    const location = {
      id: "test:lutsk",
      displayName: "Lutsk, Ukraine",
      kind: "city" as const,
      coordinates: { latitude: 50.75784, longitude: 25.35024 },
      timezone: "Europe/Kyiv",
    };

    const result = await provider.getWeatherAndAirQuality(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(provider.descriptor.capabilities.airQuality).toBe(true);
    expect(result).toMatchObject({
      weather: {
        current: { temperatureCelsius: 30 },
        hourly: [{ temperatureCelsius: 30 }],
      },
      airQuality: {
        current: {
          validAt: "2026-08-16T15:00:00.000Z",
          indices: [{ scale: "eu-caqi", value: 36, category: "fair" }],
          pollutants: {
            particulateMatter2_5: {
              value: 11.8,
              unit: "micrograms_per_cubic_metre",
            },
            particulateMatter10: {
              value: 14.6,
              unit: "micrograms_per_cubic_metre",
            },
            ozone: { value: 42.8, unit: "parts_per_billion" },
            nitrogenDioxide: { value: 0.6, unit: "parts_per_billion" },
            sulphurDioxide: { value: 0.5, unit: "parts_per_billion" },
            carbonMonoxide: { value: 149, unit: "parts_per_billion" },
          },
        },
        hourly: [{ intervalMinutes: 60 }],
        metadata: {
          providerId: "pirate-weather",
          spatialRepresentation: "grid",
        },
      },
    });
    const [input, init] = fetch.mock.calls[0] ?? [];
    const requested = new URL(String(input));
    expect(requested.searchParams.get("version")).toBe("2");
    expect(requested.searchParams.get("units")).toBe("si");
    expect(requested.searchParams.get("include")).toBe("airqualitydetails");
    expect(requested.href).not.toContain("pirate-test-key");
    expect(new Headers(init?.headers).get("apikey")).toBe("pirate-test-key");
  });
});
