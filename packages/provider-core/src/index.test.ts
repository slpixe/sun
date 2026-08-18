import { describe, expect, it, vi } from "vitest";

import {
  InMemoryProviderLoadBudget,
  InMemoryWeatherCache,
  ProviderBudgetExceededError,
  ProviderResourceCache,
  UpstashRedisStore,
  resourceCacheKey,
  type CacheFreshness,
  type WeatherCache,
} from "./index.js";

interface TestResource {
  id: string;
  freshness: CacheFreshness;
}

const freshnessFor = (resource: TestResource) => resource.freshness;

function resource(
  id: string,
  expiresAt = "2026-08-15T12:10:00Z",
  staleAfter = "2026-08-15T13:00:00Z",
): TestResource {
  return {
    id,
    freshness: {
      fetchedAt: "2026-08-15T12:00:00Z",
      expiresAt,
      staleAfter,
    },
  };
}

describe("provider resource cache", () => {
  it("normalizes resource keys without conflating resource types", () => {
    expect(
      resourceCacheKey({
        resource: "weather",
        providerId: "open-meteo",
        latitude: 50.75784,
        longitude: 25.35024,
        elevationMetres: 123.6,
        timezone: "Europe/Kyiv",
      }),
    ).toBe(
      "weather:v1:open-meteo:50.7578:25.3502:124m:Europe%2FKyiv",
    );
    expect(
      resourceCacheKey({
        resource: "airQuality",
        providerId: "open-meteo",
        latitude: 50.75784,
        longitude: 25.35024,
      }),
    ).toBe("airQuality:v1:open-meteo:50.7578:25.3502");
  });

  it("returns a fresh hit without calling the provider again", async () => {
    const now = () => new Date("2026-08-15T12:05:00Z");
    const cache = new ProviderResourceCache({ now });
    const load = vi.fn(async () => resource("first"));

    const first = await cache.getOrLoad("weather-key", load, freshnessFor);
    const second = await cache.getOrLoad("weather-key", load, freshnessFor);

    expect(first).toMatchObject({ cacheStatus: "miss", value: { id: "first" } });
    expect(second).toMatchObject({ cacheStatus: "hit", value: { id: "first" } });
    expect(load).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent misses into one provider request", async () => {
    const now = () => new Date("2026-08-15T12:05:00Z");
    const cache = new ProviderResourceCache({ now });
    let resolveLoad: ((value: TestResource) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<TestResource>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const requests = [
      cache.getOrLoad("weather-key", load, freshnessFor),
      cache.getOrLoad("weather-key", load, freshnessFor),
      cache.getOrLoad("weather-key", load, freshnessFor),
    ];
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();

    resolveLoad?.(resource("shared"));
    await expect(Promise.all(requests)).resolves.toEqual([
      expect.objectContaining({ cacheStatus: "miss", value: expect.objectContaining({ id: "shared" }) }),
      expect.objectContaining({ cacheStatus: "miss", value: expect.objectContaining({ id: "shared" }) }),
      expect.objectContaining({ cacheStatus: "miss", value: expect.objectContaining({ id: "shared" }) }),
    ]);
  });

  it("keeps provider data available when cache storage fails", async () => {
    const storage: WeatherCache = {
      get: vi.fn(async () => {
        throw new Error("cache read failed");
      }),
      set: vi.fn(async () => {
        throw new Error("cache write failed");
      }),
    };
    const onCacheError = vi.fn();
    const cache = new ProviderResourceCache({
      cache: storage,
      now: () => new Date("2026-08-15T12:05:00Z"),
      onCacheError,
    });

    await expect(
      cache.getOrLoad(
        "weather-key",
        async () => resource("provider-value"),
        freshnessFor,
      ),
    ).resolves.toMatchObject({
      cacheStatus: "miss",
      value: { id: "provider-value" },
    });
    expect(onCacheError).toHaveBeenCalledTimes(2);
    expect(onCacheError).toHaveBeenNthCalledWith(
      1,
      expect.any(Error),
      { operation: "get", key: "weather-key" },
    );
    expect(onCacheError).toHaveBeenNthCalledWith(
      2,
      expect.any(Error),
      { operation: "set", key: "weather-key" },
    );
  });

  it("refreshes expired data and serves stale data if refresh fails", async () => {
    let currentTime = new Date("2026-08-15T12:05:00Z");
    const now = () => currentTime;
    const cache = new ProviderResourceCache({ now });

    await cache.getOrLoad(
      "air-quality-key",
      async () => resource("cached"),
      freshnessFor,
    );
    currentTime = new Date("2026-08-15T12:20:00Z");

    const result = await cache.getOrLoad(
      "air-quality-key",
      async () => {
        throw new Error("provider unavailable");
      },
      freshnessFor,
    );

    expect(result).toMatchObject({
      cacheStatus: "stale",
      value: { id: "cached" },
    });
  });

  it("replaces an expired entry after a successful refresh", async () => {
    let currentTime = new Date("2026-08-15T12:05:00Z");
    const now = () => currentTime;
    const cache = new ProviderResourceCache({ now });
    const refreshed = resource(
      "refreshed",
      "2026-08-15T12:30:00Z",
      "2026-08-15T13:30:00Z",
    );
    refreshed.freshness.fetchedAt = "2026-08-15T12:20:00Z";
    const load = vi
      .fn<() => Promise<TestResource>>()
      .mockResolvedValueOnce(resource("initial"))
      .mockResolvedValueOnce(refreshed);

    await cache.getOrLoad("weather-key", load, freshnessFor);
    currentTime = new Date("2026-08-15T12:20:00Z");
    const refresh = await cache.getOrLoad(
      "weather-key",
      load,
      freshnessFor,
    );
    const hit = await cache.getOrLoad("weather-key", load, freshnessFor);

    expect(refresh).toMatchObject({
      cacheStatus: "miss",
      value: { id: "refreshed" },
    });
    expect(hit).toMatchObject({
      cacheStatus: "hit",
      value: { id: "refreshed" },
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not serve data after its stale window", async () => {
    let currentTime = new Date("2026-08-15T12:05:00Z");
    const now = () => currentTime;
    const storage = new InMemoryWeatherCache({ now });
    const cache = new ProviderResourceCache({ cache: storage, now });

    await cache.getOrLoad(
      "weather-key",
      async () => resource("expired"),
      freshnessFor,
    );
    currentTime = new Date("2026-08-15T13:01:00Z");

    await expect(
      cache.getOrLoad(
        "weather-key",
        async () => {
          throw new Error("provider unavailable");
        },
        freshnessFor,
      ),
    ).rejects.toThrow("provider unavailable");
  });
});

describe("provider load budgets", () => {
  it("enforces a UTC daily load limit and resets on the next day", async () => {
    let currentTime = new Date("2026-08-17T23:59:00Z");
    const budget = new InMemoryProviderLoadBudget({ now: () => currentTime });

    await expect(budget.consume("met-office", 2)).resolves.toMatchObject({
      used: 1,
      remaining: 1,
      resetsAt: "2026-08-18T00:00:00.000Z",
    });
    await expect(budget.consume("met-office", 2)).resolves.toMatchObject({
      used: 2,
      remaining: 0,
    });
    await expect(budget.consume("met-office", 2)).rejects.toBeInstanceOf(
      ProviderBudgetExceededError,
    );

    currentTime = new Date("2026-08-18T00:01:00Z");
    await expect(budget.consume("met-office", 2)).resolves.toMatchObject({
      used: 1,
      remaining: 1,
      resetsAt: "2026-08-19T00:00:00.000Z",
    });
  });

  it("persists cache entries and budgets through Upstash Redis REST commands", async () => {
    const responses: unknown[] = ["OK", JSON.stringify({
      value: { id: "shared" },
      fetchedAt: "2026-08-17T12:00:00Z",
      expiresAt: "2026-08-17T12:10:00Z",
      staleAfter: "2026-08-17T13:00:00Z",
    }), 1, -1];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ result: responses.shift() }),
    );
    const store = new UpstashRedisStore({
      url: "https://example.upstash.io/",
      token: "upstash-test-token",
      keyPrefix: "test-weather",
      fetch,
      now: () => new Date("2026-08-17T12:05:00Z"),
    });

    await store.set("weather-key", {
      value: { id: "shared" },
      fetchedAt: "2026-08-17T12:00:00Z",
      expiresAt: "2026-08-17T12:10:00Z",
      staleAfter: "2026-08-17T13:00:00Z",
    });
    await expect(store.get("weather-key")).resolves.toMatchObject({
      value: { id: "shared" },
    });
    await expect(store.consume("met-office", 100)).resolves.toMatchObject({
      used: 1,
      remaining: 99,
    });
    await expect(store.consume("met-office", 100)).rejects.toMatchObject({
      providerId: "met-office",
      limit: 100,
    });

    const commands = fetch.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)) as string[],
    );
    expect(commands[0]).toEqual([
      "SET",
      "test-weather:cache:weather-key",
      expect.any(String),
      "EX",
      "3300",
    ]);
    expect(commands[1]).toEqual([
      "GET",
      "test-weather:cache:weather-key",
    ]);
    expect(commands[2]?.slice(0, 4)).toEqual([
      "EVAL",
      expect.any(String),
      "1",
      "test-weather:budget:v1:met-office:2026-08-17",
    ]);
  });
});
