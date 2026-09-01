import { afterAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { InMemoryProviderLoadBudget } from "@weather/provider-core";
import type { WeatherProvider } from "@weather/provider-core";

import { buildApp } from "./create-app.js";

const openMeteoDescriptor: WeatherProvider["descriptor"] = {
  id: "open-meteo",
  name: "Open-Meteo",
  capabilities: {
    current: true,
    hourly: true,
    daily: true,
    alerts: false,
    airQuality: true,
    pollen: false,
    historical: true,
  },
  locationRequirements: {
    coordinates: true,
    elevation: false,
    providerLocationKey: false,
  },
  attribution: { text: "Weather data by Open-Meteo" },
};

function weatherResponse(
  location: Parameters<WeatherProvider["getWeather"]>[0],
  temperatureCelsius = 26.9,
  providerId = "open-meteo",
) {
  return {
    schemaVersion: 1 as const,
    location,
    current: {
      observedAt: "2026-08-15T15:45:00Z",
      temperatureCelsius,
      condition: "clear" as const,
    },
    hourly: [],
    daily: [],
    metadata: {
      providerId,
      fetchedAt: "2026-08-15T15:50:00Z",
      expiresAt: "2026-08-15T16:00:00Z",
      staleAfter: "2026-08-16T15:50:00Z",
    },
  };
}

const search = vi.fn(async () => [
  {
    id: "open-meteo:2643743",
    displayName: "London, England, United Kingdom",
    kind: "city" as const,
    coordinates: { latitude: 51.50853, longitude: -0.12574 },
    timezone: "Europe/London",
    countryCode: "GB",
    administrativeArea: "England",
  },
]);

function airQualityResponse() {
  return {
    current: {
      validAt: "2026-08-15T16:00:00Z",
      intervalMinutes: 60,
      indices: [
        {
          scale: "european-aqi" as const,
          value: 32,
          category: "fair" as const,
        },
      ],
      pollutants: {
        particulateMatter2_5: {
          value: 8.1,
          unit: "micrograms_per_cubic_metre" as const,
        },
      },
    },
    hourly: [],
    metadata: {
      providerId: "open-meteo",
      fetchedAt: "2026-08-15T16:05:00Z",
      expiresAt: "2026-08-15T16:35:00Z",
      staleAfter: "2026-08-16T16:05:00Z",
      spatialRepresentation: "grid" as const,
    },
  };
}

function pollenResponse() {
  return {
    current: {
      validAt: "2026-08-15T16:00:00Z",
      intervalMinutes: 60,
      concentrations: {
        grass: { value: 5.4, unit: "grains_per_cubic_metre" as const },
      },
    },
    hourly: [],
    metadata: {
      providerId: "open-meteo",
      fetchedAt: "2026-08-15T16:05:00Z",
      expiresAt: "2026-08-15T17:05:00Z",
      staleAfter: "2026-08-16T16:05:00Z",
      spatialRepresentation: "grid" as const,
      modelDomain: "cams_europe",
    },
  };
}

const getAirQuality = vi.fn(async () => airQualityResponse());

const app = buildApp({
  logger: false,
  locationSearchProvider: { search },
  weatherProvider: {
    descriptor: openMeteoDescriptor,
    getWeather: vi.fn(async (location) => weatherResponse(location)),
  },
  airQualityProvider: {
    providerId: "open-meteo",
    getAirQuality,
  },
});

afterAll(async () => {
  await app.close();
});

describe("API", () => {
  it("only exposes CORS response headers to configured browser origins", async () => {
    const corsApp = buildApp({
      logger: false,
      corsAllowedOrigins: ["https://sun.slpixe.com"],
    });

    try {
      const allowed = await corsApp.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://sun.slpixe.com" },
      });
      const rejected = await corsApp.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://example.test" },
      });
      const originless = await corsApp.inject({ method: "GET", url: "/health" });

      expect(allowed.headers["access-control-allow-origin"]).toBe(
        "https://sun.slpixe.com",
      );
      expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
      expect(originless.statusCode).toBe(200);
    } finally {
      await corsApp.close();
    }
  });

  it("reports its health", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns the provider registry", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/providers",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("max-age=300");
    expect(response.headers["cache-control"]).toContain("s-maxage=86400");
    expect(response.json()).toEqual([
      expect.objectContaining({ id: "open-meteo", name: "Open-Meteo" }),
    ]);
  });

  it("searches for canonical locations", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/locations/search?q=London&language=en",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=86400");
    expect(response.json()).toEqual({
      results: [
        {
          id: "open-meteo:2643743",
          displayName: "London, England, United Kingdom",
          kind: "city",
          coordinates: { latitude: 51.50853, longitude: -0.12574 },
          timezone: "Europe/London",
          countryCode: "GB",
          administrativeArea: "England",
        },
      ],
    });
    expect(search).toHaveBeenCalledWith("London", {
      language: "en",
      limit: 8,
    });
  });

  it("rejects invalid location searches", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/locations/search?q=L",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns a bundled forecast with shared caching headers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/weather?provider=open-meteo&lat=50.75784&lon=25.35024",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=600");
    expect(response.json()).toMatchObject({
      schemaVersion: 1,
      current: { temperatureCelsius: 26.9, condition: "clear" },
      metadata: { providerId: "open-meteo" },
    });
  });

  it("adds independently timestamped air quality when requested", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/weather?provider=open-meteo&lat=50.75784&lon=25.35024&include=airQuality",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      current: { temperatureCelsius: 26.9 },
      airQuality: {
        current: {
          indices: [
            { scale: "european-aqi", value: 32, category: "fair" },
          ],
        },
        metadata: {
          fetchedAt: "2026-08-15T16:05:00Z",
          expiresAt: "2026-08-15T16:35:00Z",
          spatialRepresentation: "grid",
        },
      },
    });
    expect(getAirQuality).toHaveBeenCalledOnce();
  });

  it("returns weather with a partial failure when optional AQ is unavailable", async () => {
    const partialApp = buildApp({
      logger: false,
      locationSearchProvider: { search },
      weatherProvider: {
        descriptor: openMeteoDescriptor,
        getWeather: vi.fn(async (location) => ({
          schemaVersion: 1 as const,
          location,
          current: {
            observedAt: "2026-08-15T15:45:00Z",
            temperatureCelsius: 26.9,
          },
          metadata: {
            providerId: "open-meteo",
            fetchedAt: "2026-08-15T15:50:00Z",
            expiresAt: "2026-08-15T16:00:00Z",
            staleAfter: "2026-08-16T15:50:00Z",
          },
        })),
      },
      airQualityProvider: {
        providerId: "open-meteo",
        getAirQuality: vi.fn(async () => {
          throw new Error("AQ upstream failed");
        }),
      },
    });

    try {
      const response = await partialApp.inject({
        method: "GET",
        url: "/v1/weather?provider=open-meteo&lat=50.7&lon=25.3&include=airQuality",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        current: { temperatureCelsius: 26.9 },
        partialFailures: [
          { resource: "airQuality", code: "provider_unavailable" },
        ],
      });
    } finally {
      await partialApp.close();
    }
  });
});

describe("API provider caching", () => {
  it("shares one weather request across weather, AQ, and pollen cache misses", async () => {
    const getWeather = vi.fn<WeatherProvider["getWeather"]>(async (location) =>
      weatherResponse(location, 20, "weatherapi"),
    );
    const getWeatherAirQualityAndPollen = vi.fn(
      async (location: Parameters<WeatherProvider["getWeather"]>[0]) => ({
        weather: weatherResponse(location, 24, "weatherapi"),
        airQuality: {
          ...airQualityResponse(),
          metadata: { ...airQualityResponse().metadata, providerId: "weatherapi" },
        },
        pollen: {
          ...pollenResponse(),
          metadata: { ...pollenResponse().metadata, providerId: "weatherapi" },
        },
      }),
    );
    const combinedApp = buildApp({
      logger: false,
      now: () => new Date("2026-08-15T15:55:00Z"),
      locationSearchProvider: { search },
      weatherProvider: {
        descriptor: {
          ...openMeteoDescriptor,
          id: "weatherapi",
          name: "WeatherAPI.com",
          capabilities: {
            ...openMeteoDescriptor.capabilities,
            airQuality: true,
            pollen: true,
          },
        },
        getWeather,
        getWeatherAirQualityAndPollen,
      },
      airQualityProvider: null,
      pollenProvider: null,
    });
    const url =
      "/v1/weather?provider=weatherapi&lat=50.75784&lon=25.35024&include=airQuality,pollen";

    try {
      const first = await combinedApp.inject({ method: "GET", url });
      const second = await combinedApp.inject({ method: "GET", url });

      expect(first.statusCode).toBe(200);
      expect(first.headers["x-weather-cache"]).toBe("miss");
      expect(first.headers["x-air-quality-cache"]).toBe("miss");
      expect(first.headers["x-pollen-cache"]).toBe("miss");
      expect(first.json()).toMatchObject({
        current: { temperatureCelsius: 24 },
        airQuality: { metadata: { providerId: "weatherapi" } },
        pollen: { metadata: { providerId: "weatherapi" } },
      });
      expect(second.headers["x-weather-cache"]).toBe("hit");
      expect(second.headers["x-air-quality-cache"]).toBe("hit");
      expect(second.headers["x-pollen-cache"]).toBe("hit");
      expect(getWeatherAirQualityAndPollen).toHaveBeenCalledOnce();
      expect(getWeather).not.toHaveBeenCalled();
    } finally {
      await combinedApp.close();
    }
  });

  it("shares one environmental request while caching AQ and pollen independently", async () => {
    const getAirQualityAndPollen = vi.fn(async () => ({
      airQuality: airQualityResponse(),
      pollen: pollenResponse(),
    }));
    const environmentalProvider = {
      providerId: "open-meteo",
      getAirQuality: vi.fn(async () => airQualityResponse()),
      getPollen: vi.fn(async () => pollenResponse()),
      getAirQualityAndPollen,
    };
    const pollenApp = buildApp({
      logger: false,
      now: () => new Date("2026-08-15T15:55:00Z"),
      locationSearchProvider: { search },
      weatherProvider: {
        descriptor: {
          ...openMeteoDescriptor,
          capabilities: { ...openMeteoDescriptor.capabilities, pollen: true },
        },
        getWeather: vi.fn(async (location) => weatherResponse(location)),
      },
      airQualityProviders: [environmentalProvider],
      pollenProviders: [environmentalProvider],
    });
    const url =
      "/v1/weather?provider=open-meteo&lat=50.75784&lon=25.35024&include=airQuality,pollen";

    try {
      const first = await pollenApp.inject({ method: "GET", url });
      const second = await pollenApp.inject({ method: "GET", url });

      expect(first.statusCode).toBe(200);
      expect(first.headers["x-air-quality-cache"]).toBe("miss");
      expect(first.headers["x-pollen-cache"]).toBe("miss");
      expect(first.json()).toMatchObject({
        airQuality: { metadata: { providerId: "open-meteo" } },
        pollen: {
          current: { concentrations: { grass: { value: 5.4 } } },
          metadata: { modelDomain: "cams_europe" },
        },
      });
      expect(second.headers["x-air-quality-cache"]).toBe("hit");
      expect(second.headers["x-pollen-cache"]).toBe("hit");
      expect(getAirQualityAndPollen).toHaveBeenCalledOnce();
      expect(environmentalProvider.getAirQuality).not.toHaveBeenCalled();
      expect(environmentalProvider.getPollen).not.toHaveBeenCalled();
    } finally {
      await pollenApp.close();
    }
  });

  it("caches weather and air quality as independent resources", async () => {
    const getWeather = vi.fn<WeatherProvider["getWeather"]>(async (location) =>
      weatherResponse(location),
    );
    const getCachedAirQuality = vi.fn(async () => airQualityResponse());
    const cachedApp = buildApp({
      logger: false,
      now: () => new Date("2026-08-15T15:55:00Z"),
      locationSearchProvider: { search },
      weatherProvider: {
        descriptor: openMeteoDescriptor,
        getWeather,
      },
      airQualityProvider: {
        providerId: "open-meteo",
        getAirQuality: getCachedAirQuality,
      },
    });
    const baseUrl =
      "/v1/weather?provider=open-meteo&lat=50.75784&lon=25.35024";

    try {
      const weatherOnly = await cachedApp.inject({
        method: "GET",
        url: baseUrl,
      });
      const firstBundle = await cachedApp.inject({
        method: "GET",
        url: `${baseUrl}&include=airQuality`,
      });
      const secondBundle = await cachedApp.inject({
        method: "GET",
        url: `${baseUrl}&include=airQuality`,
      });

      expect(weatherOnly.headers["x-weather-cache"]).toBe("miss");
      expect(weatherOnly.headers["x-air-quality-cache"]).toBeUndefined();
      expect(firstBundle.headers["x-weather-cache"]).toBe("hit");
      expect(firstBundle.headers["x-air-quality-cache"]).toBe("miss");
      expect(secondBundle.headers["x-weather-cache"]).toBe("hit");
      expect(secondBundle.headers["x-air-quality-cache"]).toBe("hit");
      expect(getWeather).toHaveBeenCalledOnce();
      expect(getCachedAirQuality).toHaveBeenCalledOnce();
    } finally {
      await cachedApp.close();
    }
  });

  it("shares one bundled upstream call across weather and AQ cache misses", async () => {
    const getWeather = vi.fn<WeatherProvider["getWeather"]>(async (location) =>
      weatherResponse(location, 20, "weatherapi"),
    );
    const getWeatherAndAirQuality = vi.fn(
      async (location: Parameters<WeatherProvider["getWeather"]>[0]) => ({
        weather: weatherResponse(location, 23, "weatherapi"),
        airQuality: {
          ...airQualityResponse(),
          metadata: {
            ...airQualityResponse().metadata,
            providerId: "weatherapi",
          },
        },
      }),
    );
    const combinedApp = buildApp({
      logger: false,
      now: () => new Date("2026-08-15T15:55:00Z"),
      locationSearchProvider: { search },
      weatherProvider: {
        descriptor: {
          ...openMeteoDescriptor,
          id: "weatherapi",
          name: "WeatherAPI.com",
        },
        getWeather,
        getWeatherAndAirQuality,
      },
      airQualityProvider: null,
    });
    const url =
      "/v1/weather?provider=weatherapi&lat=50.75784&lon=25.35024&include=airQuality";

    try {
      const first = await combinedApp.inject({ method: "GET", url });
      const second = await combinedApp.inject({ method: "GET", url });

      expect(first.statusCode).toBe(200);
      expect(first.headers["x-weather-cache"]).toBe("miss");
      expect(first.headers["x-air-quality-cache"]).toBe("miss");
      expect(first.json()).toMatchObject({
        current: { temperatureCelsius: 23 },
        airQuality: { metadata: { providerId: "weatherapi" } },
      });
      expect(second.headers["x-weather-cache"]).toBe("hit");
      expect(second.headers["x-air-quality-cache"]).toBe("hit");
      expect(getWeatherAndAirQuality).toHaveBeenCalledOnce();
      expect(getWeather).not.toHaveBeenCalled();
    } finally {
      await combinedApp.close();
    }
  });

  it("serves stale weather when an expired entry cannot be refreshed", async () => {
    let currentTime = new Date("2026-08-15T15:55:00Z");
    const getWeather = vi
      .fn<WeatherProvider["getWeather"]>()
      .mockImplementationOnce(async (location) => weatherResponse(location, 21))
      .mockRejectedValue(new Error("weather upstream failed"));
    const staleApp = buildApp({
      logger: false,
      now: () => currentTime,
      locationSearchProvider: { search },
      weatherProvider: {
        descriptor: openMeteoDescriptor,
        getWeather,
      },
      airQualityProvider: null,
    });
    const url =
      "/v1/weather?provider=open-meteo&lat=50.75784&lon=25.35024";

    try {
      const first = await staleApp.inject({ method: "GET", url });
      currentTime = new Date("2026-08-15T16:05:00Z");
      const stale = await staleApp.inject({ method: "GET", url });

      expect(first.statusCode).toBe(200);
      expect(first.headers["x-weather-cache"]).toBe("miss");
      expect(stale.statusCode).toBe(200);
      expect(stale.headers["x-weather-cache"]).toBe("stale");
      expect(stale.json()).toMatchObject({
        current: { temperatureCelsius: 21 },
      });
      expect(getWeather).toHaveBeenCalledTimes(2);
    } finally {
      await staleApp.close();
    }
  });

  it("loads cached data without spending budget and rejects a new miss after the daily limit", async () => {
    const now = () => new Date("2026-08-17T12:00:00Z");
    const getWeather = vi.fn<WeatherProvider["getWeather"]>(async (location) => ({
      ...weatherResponse(location, 18, "met-office"),
      metadata: {
        providerId: "met-office",
        fetchedAt: "2026-08-17T12:00:00Z",
        expiresAt: "2026-08-17T13:00:00Z",
        staleAfter: "2026-08-18T12:00:00Z",
      },
    }));
    const budgetApp = buildApp({
      logger: false,
      now,
      locationSearchProvider: { search },
      weatherProvider: {
        descriptor: {
          ...openMeteoDescriptor,
          id: "met-office",
          name: "UK Met Office",
        },
        getWeather,
      },
      airQualityProvider: null,
      providerLoadBudget: new InMemoryProviderLoadBudget({ now }),
      providerDailyLoadBudgets: { "met-office": 1 },
    });

    try {
      const first = await budgetApp.inject({
        method: "GET",
        url: "/v1/weather?provider=met-office&lat=50.75&lon=25.35",
      });
      const cached = await budgetApp.inject({
        method: "GET",
        url: "/v1/weather?provider=met-office&lat=50.75&lon=25.35",
      });
      const exhausted = await budgetApp.inject({
        method: "GET",
        url: "/v1/weather?provider=met-office&lat=51.5&lon=-0.12",
      });

      expect(first.statusCode).toBe(200);
      expect(first.headers["x-weather-cache"]).toBe("miss");
      expect(cached.statusCode).toBe(200);
      expect(cached.headers["x-weather-cache"]).toBe("hit");
      expect(exhausted.statusCode).toBe(429);
      expect(exhausted.headers["retry-after"]).toBeDefined();
      expect(exhausted.json()).toMatchObject({
        error: "provider_budget_exhausted",
        providerId: "met-office",
        resetsAt: "2026-08-18T00:00:00.000Z",
      });
      expect(getWeather).toHaveBeenCalledOnce();
    } finally {
      await budgetApp.close();
    }
  });
});

describe("API provider routing", () => {
  it("lists and routes requests to a second weather provider", async () => {
    const openMeteoWeather = vi.fn<WeatherProvider["getWeather"]>(
      async (location) => weatherResponse(location),
    );
    const metNorwayWeather = vi.fn<WeatherProvider["getWeather"]>(
      async (location) => weatherResponse(location, 18, "met-norway"),
    );
    const disabledCombinedWeather = vi.fn(
      async (location: Parameters<WeatherProvider["getWeather"]>[0]) => ({
        weather: weatherResponse(location, 19, "met-norway"),
        airQuality: airQualityResponse(),
      }),
    );
    const routingApp = buildApp({
      logger: false,
      now: () => new Date("2026-08-15T15:55:00Z"),
      locationSearchProvider: { search },
      weatherProviders: [
        {
          descriptor: openMeteoDescriptor,
          getWeather: openMeteoWeather,
        },
        {
          descriptor: {
            ...openMeteoDescriptor,
            id: "met-norway",
            name: "MET Norway",
            capabilities: {
              ...openMeteoDescriptor.capabilities,
              airQuality: false,
              historical: false,
            },
          },
          getWeather: metNorwayWeather,
          getWeatherAndAirQuality: disabledCombinedWeather,
        },
      ],
      airQualityProviders: [],
    });

    try {
      const providers = await routingApp.inject({
        method: "GET",
        url: "/v1/providers",
      });
      const forecast = await routingApp.inject({
        method: "GET",
        url: "/v1/weather?provider=met-norway&lat=50.75&lon=25.35&timezone=Europe%2FKyiv&include=airQuality",
      });

      expect(providers.json()).toEqual([
        expect.objectContaining({ id: "open-meteo" }),
        expect.objectContaining({ id: "met-norway" }),
      ]);
      expect(forecast.statusCode).toBe(200);
      expect(forecast.json()).toMatchObject({
        location: { timezone: "Europe/Kyiv" },
        current: { temperatureCelsius: 18 },
        metadata: { providerId: "met-norway" },
        partialFailures: [
          { resource: "airQuality", code: "unsupported" },
        ],
      });
      expect(openMeteoWeather).not.toHaveBeenCalled();
      expect(disabledCombinedWeather).not.toHaveBeenCalled();
      expect(metNorwayWeather).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: "Europe/Kyiv" }),
        expect.objectContaining({
          sections: ["current", "hourly", "daily"],
        }),
      );
    } finally {
      await routingApp.close();
    }
  });
});
