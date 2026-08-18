import type {
  AirQualityResource,
  LocationSearchQuery,
  ProviderDescriptor,
  PollenResource,
  WeatherResponse,
} from "@weather/contracts";
import type { ResolvedLocation } from "@weather/weather-domain";

export interface LocationSearchProvider {
  search(
    query: string,
    options: Omit<LocationSearchQuery, "q">,
  ): Promise<ResolvedLocation[]>;
}

export type WeatherSection = "current" | "hourly" | "daily" | "alerts";

export interface WeatherRequest {
  sections: readonly WeatherSection[];
  previous?: WeatherResponse;
}

export interface WeatherProvider {
  readonly descriptor: ProviderDescriptor;

  getWeather(
    location: ResolvedLocation,
    request: WeatherRequest,
  ): Promise<WeatherResponse>;

  getWeatherAndAirQuality?(
    location: ResolvedLocation,
    request: WeatherRequest,
  ): Promise<WeatherAirQualityBundle>;

  getWeatherAndPollen?(
    location: ResolvedLocation,
    request: WeatherRequest,
  ): Promise<WeatherPollenBundle>;

  getWeatherAirQualityAndPollen?(
    location: ResolvedLocation,
    request: WeatherRequest,
  ): Promise<WeatherAirQualityPollenBundle>;
}

export interface WeatherAirQualityBundle {
  weather: WeatherResponse;
  airQuality: AirQualityResource;
}

export interface WeatherPollenBundle {
  weather: WeatherResponse;
  pollen: PollenResource;
}

export interface WeatherAirQualityPollenBundle
  extends WeatherAirQualityBundle,
    WeatherPollenBundle {}

export interface AirQualityProvider {
  readonly providerId: string;

  getAirQuality(location: ResolvedLocation): Promise<AirQualityResource>;

  getAirQualityAndPollen?(
    location: ResolvedLocation,
  ): Promise<AirQualityPollenBundle>;
}

export interface PollenProvider {
  readonly providerId: string;

  getPollen(location: ResolvedLocation): Promise<PollenResource>;

  getAirQualityAndPollen?(
    location: ResolvedLocation,
  ): Promise<AirQualityPollenBundle>;
}

export interface AirQualityPollenBundle {
  airQuality: AirQualityResource;
  pollen: PollenResource;
}

export interface CacheEntry<T> {
  value: T;
  fetchedAt: string;
  expiresAt: string;
  staleAfter: string;
}

export interface WeatherCache {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
}

export interface ProviderLoadBudgetResult {
  providerId: string;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
}

export interface ProviderLoadBudget {
  consume(providerId: string, limit: number): Promise<ProviderLoadBudgetResult>;
}

export class ProviderBudgetExceededError extends Error {
  readonly providerId: string;
  readonly limit: number;
  readonly resetsAt: string;

  constructor(providerId: string, limit: number, resetsAt: string) {
    super(`Daily provider load budget exhausted for ${providerId}`);
    this.name = "ProviderBudgetExceededError";
    this.providerId = providerId;
    this.limit = limit;
    this.resetsAt = resetsAt;
  }
}

function budgetWindow(now: Date) {
  const day = now.toISOString().slice(0, 10);
  const resetsAt = new Date(`${day}T00:00:00.000Z`);
  resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);
  return { day, resetsAt: resetsAt.toISOString() };
}

export interface InMemoryProviderLoadBudgetOptions {
  now?: () => Date;
}

export class InMemoryProviderLoadBudget implements ProviderLoadBudget {
  readonly #counts = new Map<string, number>();
  readonly #now: () => Date;
  #currentDay = "";

  constructor(options: InMemoryProviderLoadBudgetOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  async consume(
    providerId: string,
    limit: number,
  ): Promise<ProviderLoadBudgetResult> {
    validateBudgetInput(providerId, limit);
    const { day, resetsAt } = budgetWindow(this.#now());
    if (day !== this.#currentDay) {
      this.#counts.clear();
      this.#currentDay = day;
    }
    const used = this.#counts.get(providerId) ?? 0;
    if (used >= limit) {
      throw new ProviderBudgetExceededError(providerId, limit, resetsAt);
    }
    const nextUsed = used + 1;
    this.#counts.set(providerId, nextUsed);
    return {
      providerId,
      limit,
      used: nextUsed,
      remaining: limit - nextUsed,
      resetsAt,
    };
  }
}

export interface UpstashRedisStoreOptions {
  url: string;
  token: string;
  keyPrefix?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}

const CONSUME_BUDGET_SCRIPT = [
  "local used = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "local limit = tonumber(ARGV[1])",
  "if used >= limit then return -1 end",
  "used = redis.call('INCR', KEYS[1])",
  "if used == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end",
  "return used",
].join("\n");

export class UpstashRedisStore implements WeatherCache, ProviderLoadBudget {
  readonly #url: string;
  readonly #token: string;
  readonly #keyPrefix: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => Date;

  constructor(options: UpstashRedisStoreOptions) {
    this.#url = options.url.trim().replace(/\/$/, "");
    this.#token = options.token.trim();
    this.#keyPrefix = options.keyPrefix?.trim() || "weather";
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? (() => new Date());
    if (!this.#url.startsWith("https://")) {
      throw new Error("Upstash Redis URL must use HTTPS");
    }
    if (this.#token.length < 8) {
      throw new Error("Upstash Redis token is required");
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const result = await this.#command<unknown>([
      "GET",
      this.#cacheKey(key),
    ]);
    if (result === null) return undefined;
    if (typeof result !== "string") {
      throw new Error("Upstash Redis returned an invalid cache value");
    }
    const entry = JSON.parse(result) as CacheEntry<T>;
    if (Date.parse(entry.staleAfter) <= this.#now().getTime()) {
      return undefined;
    }
    return entry;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const ttlSeconds = Math.ceil(
      (Date.parse(entry.staleAfter) - this.#now().getTime()) / 1_000,
    );
    if (ttlSeconds <= 0) return;
    await this.#command([
      "SET",
      this.#cacheKey(key),
      JSON.stringify(entry),
      "EX",
      ttlSeconds.toString(),
    ]);
  }

  async consume(
    providerId: string,
    limit: number,
  ): Promise<ProviderLoadBudgetResult> {
    validateBudgetInput(providerId, limit);
    const now = this.#now();
    const { day, resetsAt } = budgetWindow(now);
    const ttlSeconds = Math.max(
      60,
      Math.ceil((Date.parse(resetsAt) - now.getTime()) / 1_000) + 3_600,
    );
    const used = await this.#command<unknown>([
      "EVAL",
      CONSUME_BUDGET_SCRIPT,
      "1",
      `${this.#keyPrefix}:budget:v1:${providerId}:${day}`,
      limit.toString(),
      ttlSeconds.toString(),
    ]);
    if (used === -1) {
      throw new ProviderBudgetExceededError(providerId, limit, resetsAt);
    }
    if (typeof used !== "number" || !Number.isInteger(used) || used < 1) {
      throw new Error("Upstash Redis returned an invalid budget counter");
    }
    return {
      providerId,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsAt,
    };
  }

  #cacheKey(key: string): string {
    return `${this.#keyPrefix}:cache:${key}`;
  }

  async #command<T>(command: readonly (string | number)[]): Promise<T> {
    const response = await this.#fetch(this.#url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      throw new Error(`Upstash Redis returned ${response.status}`);
    }
    const payload = (await response.json()) as {
      result?: T;
      error?: string;
    };
    if (payload.error !== undefined) {
      throw new Error(`Upstash Redis command failed: ${payload.error}`);
    }
    return payload.result as T;
  }
}

function validateBudgetInput(providerId: string, limit: number): void {
  if (providerId.trim().length === 0) {
    throw new Error("providerId is required");
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Provider load budget must be a positive integer");
  }
}

export type CacheStatus = "hit" | "miss" | "stale";

export interface CachedResource<T> {
  value: T;
  cacheStatus: CacheStatus;
}

export interface CacheFreshness {
  fetchedAt: string;
  expiresAt: string;
  staleAfter: string;
}

export interface ResourceCacheKeyOptions {
  resource: "weather" | "airQuality" | "pollen";
  providerId: string;
  latitude: number;
  longitude: number;
  elevationMetres?: number;
  timezone?: string;
  schemaVersion?: number;
}

function normalizedCoordinate(value: number): string {
  const normalized = Number(value.toFixed(4));
  return Object.is(normalized, -0) ? "0.0000" : normalized.toFixed(4);
}

export function resourceCacheKey({
  resource,
  providerId,
  latitude,
  longitude,
  elevationMetres,
  timezone,
  schemaVersion = 1,
}: ResourceCacheKeyOptions): string {
  const coordinates = `${normalizedCoordinate(latitude)}:${normalizedCoordinate(longitude)}`;
  const elevation =
    elevationMetres === undefined ? "" : `:${Math.round(elevationMetres)}m`;
  const timezoneVariant =
    timezone === undefined ? "" : `:${encodeURIComponent(timezone)}`;
  return `${resource}:v${schemaVersion}:${providerId}:${coordinates}${elevation}${timezoneVariant}`;
}

export interface InMemoryWeatherCacheOptions {
  now?: () => Date;
  maxEntries?: number;
}

export class InMemoryWeatherCache implements WeatherCache {
  readonly #entries = new Map<string, CacheEntry<unknown>>();
  readonly #now: () => Date;
  readonly #maxEntries: number;

  constructor(options: InMemoryWeatherCacheOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#maxEntries = options.maxEntries ?? 500;
    if (!Number.isInteger(this.#maxEntries) || this.#maxEntries < 1) {
      throw new Error("maxEntries must be a positive integer");
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (Date.parse(entry.staleAfter) <= this.#now().getTime()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry as CacheEntry<T>;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.#entries.delete(key);
    while (this.#entries.size >= this.#maxEntries) {
      const oldestKey = this.#entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.#entries.delete(oldestKey);
    }
    this.#entries.set(key, entry as CacheEntry<unknown>);
  }
}

export interface ProviderResourceCacheOptions {
  cache?: WeatherCache;
  now?: () => Date;
  onCacheError?: (
    error: unknown,
    context: { operation: "get" | "set"; key: string },
  ) => void;
}

export class ProviderResourceCache {
  readonly #cache: WeatherCache;
  readonly #now: () => Date;
  readonly #onCacheError: ProviderResourceCacheOptions["onCacheError"];
  readonly #inFlight = new Map<string, Promise<CachedResource<unknown>>>();

  constructor(options: ProviderResourceCacheOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#cache =
      options.cache ?? new InMemoryWeatherCache({ now: this.#now });
    this.#onCacheError = options.onCacheError;
  }

  async getOrLoad<T>(
    key: string,
    load: (cached?: T) => Promise<T>,
    freshnessFor: (value: T) => CacheFreshness,
  ): Promise<CachedResource<T>> {
    let cached: CacheEntry<T> | undefined;
    try {
      cached = await this.#cache.get<T>(key);
    } catch (error) {
      this.#reportCacheError(error, { operation: "get", key });
    }
    const now = this.#now().getTime();

    if (cached !== undefined && Date.parse(cached.expiresAt) > now) {
      return { value: cached.value, cacheStatus: "hit" };
    }

    const inFlight = this.#inFlight.get(key);
    if (inFlight !== undefined) {
      return inFlight as Promise<CachedResource<T>>;
    }

    const pending = (async (): Promise<CachedResource<T>> => {
      let value: T;
      try {
        value = await load(cached?.value);
      } catch (error) {
        if (
          cached !== undefined &&
          Date.parse(cached.staleAfter) > this.#now().getTime()
        ) {
          return { value: cached.value, cacheStatus: "stale" };
        }
        throw error;
      }

      try {
        const freshness = freshnessFor(value);
        validateFreshness(freshness);
        await this.#cache.set(key, { value, ...freshness });
      } catch (error) {
        this.#reportCacheError(error, { operation: "set", key });
      }
      return { value, cacheStatus: "miss" };
    })();

    this.#inFlight.set(key, pending as Promise<CachedResource<unknown>>);
    try {
      return await pending;
    } finally {
      if (this.#inFlight.get(key) === pending) {
        this.#inFlight.delete(key);
      }
    }
  }

  #reportCacheError(
    error: unknown,
    context: { operation: "get" | "set"; key: string },
  ): void {
    try {
      this.#onCacheError?.(error, context);
    } catch {
      // Cache diagnostics must never make provider data unavailable.
    }
  }
}

function validateFreshness(freshness: CacheFreshness): void {
  const fetchedAt = Date.parse(freshness.fetchedAt);
  const expiresAt = Date.parse(freshness.expiresAt);
  const staleAfter = Date.parse(freshness.staleAfter);
  if (
    !Number.isFinite(fetchedAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(staleAfter) ||
    expiresAt < fetchedAt ||
    staleAfter < expiresAt
  ) {
    throw new Error("Cache freshness timestamps are invalid");
  }
}
