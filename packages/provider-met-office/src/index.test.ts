import { describe, expect, it, vi } from "vitest";

import { MetOfficeWeatherProvider, type FetchLike } from "./index.js";

const location = {
  id: "test:lutsk",
  displayName: "Lutsk, Ukraine",
  kind: "city" as const,
  coordinates: { latitude: 50.75784, longitude: 25.35024 },
  timezone: "Europe/Kyiv",
};

function feature(timeSeries: unknown[], modelRunDate: string) {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Point", coordinates: [25.34, 50.75, 190] },
      properties: {
        requestPointDistance: 1.4,
        modelRunDate,
        locationName: "LUTSK",
        timeSeries,
      },
    }],
  };
}

describe("Met Office weather provider", () => {
  it("maps nearest-site hourly and native daily Global Spot forecasts", async () => {
    const fetch = vi.fn<FetchLike>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/hourly")) {
        return Response.json(
          feature([
            {
              time: "2026-08-17T10:00:00Z",
              screenTemperature: 19.2,
              feelsLikeTemperature: 18.4,
              screenRelativeHumidity: 67,
              windSpeed10m: 4.5,
              windDirectionFrom10m: 270,
              visibility: 20_000,
              uvIndex: 3,
              significantWeatherCode: 3,
              probOfPrecipitation: 18,
            },
            {
              time: "2026-08-17T11:00:00Z",
              screenTemperature: 20.1,
              visibility: 18_500,
              uvIndex: 4,
              significantWeatherCode: 10,
              probOfPrecipitation: 42,
            },
          ], "2026-08-17T09:00:00Z"),
          { headers: { expires: "Mon, 17 Aug 2026 11:30:00 GMT" } },
        );
      }
      return Response.json(
        feature([
          {
            time: "2026-08-16T12:00:00Z",
            nightMinScreenTemperature: 12,
            dayMaxScreenTemperature: 23,
          },
          {
            time: "2026-08-17T12:00:00Z",
            nightMinScreenTemperature: 13,
            dayMaxScreenTemperature: 24,
            maxUvIndex: 5,
            daySignificantWeatherCode: 7,
          },
          {
            time: "2026-08-18T12:00:00Z",
            nightMinScreenTemperature: 11,
            dayMaxScreenTemperature: 21,
            maxUvIndex: 4,
            daySignificantWeatherCode: 15,
          },
        ], "2026-08-17T08:00:00Z"),
        { headers: { expires: "Mon, 17 Aug 2026 12:00:00 GMT" } },
      );
    });
    const provider = new MetOfficeWeatherProvider({
      apiKey: "met-office-test-key",
      fetch,
      now: () => new Date("2026-08-17T10:15:00Z"),
    });

    const result = await provider.getWeather(location, {
      sections: ["current", "hourly", "daily"],
    });

    expect(result).toMatchObject({
      current: {
        observedAt: "2026-08-17T10:00:00Z",
        temperatureCelsius: 19.2,
        feelsLikeCelsius: 18.4,
        relativeHumidityPercent: 67,
        precipitationProbabilityPercent: 18,
        windSpeedMetresPerSecond: 4.5,
        windDirectionDegrees: 270,
        condition: "partly_cloudy",
      },
      hourly: [
        {
          validAt: "2026-08-17T10:00:00Z",
          intervalMinutes: 60,
          visibilityMetres: 20_000,
          uvIndex: 3,
        },
        {
          validAt: "2026-08-17T11:00:00Z",
          condition: "rain",
        },
      ],
      daily: [
        {
          date: "2026-08-17",
          minimumTemperatureCelsius: 13,
          maximumTemperatureCelsius: 24,
          maximumUvIndex: 5,
          condition: "cloudy",
        },
        {
          date: "2026-08-18",
          minimumTemperatureCelsius: 11,
          maximumTemperatureCelsius: 21,
          condition: "rain",
        },
      ],
      metadata: {
        providerId: "met-office",
        fetchedAt: "2026-08-17T10:15:00.000Z",
        expiresAt: "2026-08-17T11:30:00.000Z",
        staleAfter: "2026-08-18T11:30:00.000Z",
        forecastGeneratedAt: "2026-08-17T09:00:00Z",
        sourceLocation: {
          coordinates: {
            latitude: 50.75,
            longitude: 25.34,
            elevationMetres: 190,
          },
          displayName: "LUTSK",
          distanceFromRequestedMetres: 1.4,
        },
      },
    });
    expect(provider.descriptor.dataProfile.weatherSpatial).toBe("nearest_site");
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [input, init] of fetch.mock.calls) {
      const url = new URL(String(input));
      expect(url.searchParams.get("latitude")).toBe("50.75784");
      expect(url.searchParams.get("longitude")).toBe("25.35024");
      expect(url.searchParams.get("includeLocationName")).toBe("true");
      expect(new Headers(init?.headers).get("apikey")).toBe(
        "met-office-test-key",
      );
    }
  });
});
