import { describe, expect, it, vi } from "vitest";

import { TomorrowIoProvider, type FetchLike } from "./index.js";

const values = {
  temperature: 27,
  temperatureApparent: 28,
  humidity: 45,
  precipitationProbability: 15,
  windSpeed: 3,
  windDirection: 190,
  uvIndex: 4,
  visibility: 16,
  weatherCode: 1101,
};

describe("Tomorrow.io provider", () => {
  it("maps convenience forecast timelines into canonical resources", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        timelines: {
          minutely: [{ time: "2026-08-16T15:14:00Z", values }],
          hourly: [{ time: "2026-08-16T15:00:00Z", values }],
          daily: [
            {
              time: "2026-08-16T03:00:00Z",
              values: {
                temperatureMin: 16,
                temperatureMax: 31,
                sunriseTime: "2026-08-16T03:07:00Z",
                sunsetTime: "2026-08-16T17:38:00Z",
                uvIndexMax: 6,
                weatherCodeMax: 1001,
              },
            },
          ],
        },
      }),
    );
    const provider = new TomorrowIoProvider({
      apiKey: "tomorrow-test-key",
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
        observedAt: "2026-08-16T15:14:00Z",
        temperatureCelsius: 27,
        precipitationProbabilityPercent: 15,
        condition: "partly_cloudy",
      },
      hourly: [
        {
          validAt: "2026-08-16T15:00:00Z",
          visibilityMetres: 16_000,
          uvIndex: 4,
        },
      ],
      daily: [
        {
          date: "2026-08-16",
          maximumUvIndex: 6,
          condition: "cloudy",
        },
      ],
      metadata: { providerId: "tomorrow-io" },
    });
    const requested = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe("/v4/weather/forecast");
    expect(requested.searchParams.get("units")).toBe("metric");
    expect(requested.searchParams.get("apikey")).toBe("tomorrow-test-key");
    expect(provider.descriptor.capabilities.airQuality).toBe(false);
    expect(provider.descriptor.capabilities.pollen).toBe(false);
    expect(provider.descriptor.featureProfile?.pollen.detail).toContain(
      "configured plan does not expose",
    );
    expect(provider.getWeatherAndAirQuality).toBeUndefined();
  });

  it("maps weather and air quality from one enabled Timeline request", async () => {
    const airQuality = {
      particulateMatter25: 8.5,
      particulateMatter10: 14.2,
      pollutantO3: 31,
      pollutantNO2: 9,
      pollutantCO: 0.18,
      pollutantSO2: 2,
      epaIndex: 42,
      epaHealthConcern: 0,
    };
    const weather = {
      temperature: 27,
      temperatureApparent: 28,
      humidity: 45,
      precipitationProbability: 15,
      windSpeed: 3,
      windDirection: 190,
      uvIndex: 4,
      visibility: 16,
      weatherCode: 1101,
    };
    const fetch = vi.fn<FetchLike>(async () =>
      Response.json({
        data: {
          timelines: [
            {
              timestep: "1d",
              intervals: [
                {
                  startTime: "2026-08-16T00:00:00+03:00",
                  values: {
                    temperatureMin: 16,
                    temperatureMax: 31,
                    sunriseTime: "2026-08-16T06:07:00+03:00",
                    sunsetTime: "2026-08-16T20:38:00+03:00",
                    uvIndexMax: 6,
                    weatherCodeMax: 1001,
                  },
                },
              ],
            },
            {
              timestep: "1h",
              intervals: [
                {
                  startTime: "2026-08-16T18:00:00+03:00",
                  values: { ...weather, ...airQuality },
                },
              ],
            },
            {
              timestep: "current",
              intervals: [
                {
                  startTime: "2026-08-16T18:15:00+03:00",
                  values: { ...weather, ...airQuality },
                },
              ],
            },
          ],
        },
      }),
    );
    const provider = new TomorrowIoProvider({
      apiKey: "tomorrow-test-key",
      airQualityEnabled: true,
      fetch,
      now: () => new Date("2026-08-16T15:15:00Z"),
    });
    const location = {
      id: "test:lutsk",
      displayName: "Lutsk, Ukraine",
      kind: "city" as const,
      coordinates: { latitude: 50.75784, longitude: 25.35024 },
      timezone: "Europe/Kyiv",
    };

    const result = await provider.getWeatherAndAirQuality?.(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(provider.descriptor.capabilities.airQuality).toBe(true);
    expect(result).toMatchObject({
      weather: {
        current: {
          observedAt: "2026-08-16T18:15:00+03:00",
          temperatureCelsius: 27,
          condition: "partly_cloudy",
        },
        hourly: [{ validAt: "2026-08-16T18:00:00+03:00" }],
        daily: [
          {
            date: "2026-08-16",
            minimumTemperatureCelsius: 16,
            maximumTemperatureCelsius: 31,
          },
        ],
      },
      airQuality: {
        current: {
          validAt: "2026-08-16T18:15:00+03:00",
          indices: [{ scale: "us-epa", value: 42, category: "good" }],
          pollutants: {
            particulateMatter2_5: {
              value: 8.5,
              unit: "micrograms_per_cubic_metre",
            },
            particulateMatter10: {
              value: 14.2,
              unit: "micrograms_per_cubic_metre",
            },
            ozone: { value: 31, unit: "parts_per_billion" },
            nitrogenDioxide: { value: 9, unit: "parts_per_billion" },
            carbonMonoxide: { value: 0.18, unit: "parts_per_million" },
            sulphurDioxide: { value: 2, unit: "parts_per_billion" },
          },
        },
        hourly: [{ intervalMinutes: 60 }],
        metadata: {
          providerId: "tomorrow-io",
          spatialRepresentation: "point",
        },
      },
    });
    const requested = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe("/v4/timelines");
    expect(requested.searchParams.get("apikey")).toBe("tomorrow-test-key");
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("POST");
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      location: [25.35024, 50.75784],
      timesteps: ["current", "1h", "1d"],
      timezone: "Europe/Kyiv",
      units: "metric",
    });
    expect(body.fields).toEqual(
      expect.arrayContaining(["temperature", "epaIndex", "particulateMatter25"]),
    );
  });
});
