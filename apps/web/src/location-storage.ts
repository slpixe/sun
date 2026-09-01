import {
  SavedLocationSchema,
  WeatherResponseSchema,
  type SavedLocation,
  type WeatherResponse,
} from "@weather/contracts";

const DATABASE_NAME = "weather";
const DATABASE_VERSION = 2;
const STORE_NAME = "preferences";
const WEATHER_STORE_NAME = "weather-responses";
const SELECTED_LOCATION_KEY = "selected-location";
export const MAX_STORED_WEATHER_RESPONSES = 24;

export interface StoredWeatherEntry {
  key: IDBValidKey;
  value: unknown;
}

let databasePromise: Promise<IDBDatabase> | undefined;

function metadataTimestamp(
  value: unknown,
  key: "fetchedAt" | "staleAfter",
): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const metadata = (value as { metadata?: unknown }).metadata;
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const timestamp = (metadata as Record<string, unknown>)[key];
  if (typeof timestamp !== "string") return undefined;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function weatherKeysToEvict(
  entries: readonly StoredWeatherEntry[],
  now = Date.now(),
  maximumEntries = MAX_STORED_WEATHER_RESPONSES,
  protectedKey?: IDBValidKey,
): IDBValidKey[] {
  const keysToEvict: IDBValidKey[] = [];
  const retained: { key: IDBValidKey; fetchedAt: number }[] = [];

  for (const entry of entries) {
    const staleAfter = metadataTimestamp(entry.value, "staleAfter");
    const fetchedAt = metadataTimestamp(entry.value, "fetchedAt");
    if (
      staleAfter === undefined ||
      staleAfter <= now ||
      fetchedAt === undefined
    ) {
      keysToEvict.push(entry.key);
      continue;
    }
    retained.push({ key: entry.key, fetchedAt });
  }

  retained.sort((left, right) => right.fetchedAt - left.fetchedAt);
  const protectedEntry = retained.find((entry) => entry.key === protectedKey);
  const unprotectedEntries = retained.filter(
    (entry) => entry !== protectedEntry,
  );
  const unprotectedLimit = Math.max(
    0,
    maximumEntries - (protectedEntry === undefined ? 0 : 1),
  );
  keysToEvict.push(
    ...unprotectedEntries.slice(unprotectedLimit).map((entry) => entry.key),
  );
  return keysToEvict;
}

function pruneWeatherStore(
  store: IDBObjectStore,
  protectedKey: IDBValidKey,
): void {
  const entries: StoredWeatherEntry[] = [];
  const request = store.openCursor();
  request.addEventListener("success", () => {
    const cursor = request.result;
    if (cursor !== null) {
      entries.push({ key: cursor.primaryKey, value: cursor.value });
      cursor.continue();
      return;
    }

    for (const key of weatherKeysToEvict(
      entries,
      Date.now(),
      MAX_STORED_WEATHER_RESPONSES,
      protectedKey,
    )) {
      store.delete(key);
    }
  });
}

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
      if (!database.objectStoreNames.contains(WEATHER_STORE_NAME)) {
        database.createObjectStore(WEATHER_STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });

  return databasePromise;
}

export async function loadSelectedLocation(): Promise<
  SavedLocation | undefined
> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(SELECTED_LOCATION_KEY);

    request.addEventListener("success", () => {
      const parsed = SavedLocationSchema.safeParse(request.result);
      if (parsed.success) {
        resolve(parsed.data);
        return;
      }

      const legacy = request.result as
        | {
            location?: Record<string, unknown>;
            providerId?: unknown;
            savedAt?: unknown;
          }
        | undefined;
      if (legacy?.location && !("kind" in legacy.location)) {
        const migrated = SavedLocationSchema.safeParse({
          providerId: legacy.providerId,
          savedAt: legacy.savedAt,
          location: { ...legacy.location, kind: "other" },
        });
        resolve(migrated.success ? migrated.data : undefined);
        return;
      }
      resolve(undefined);
    });
    request.addEventListener("error", () => reject(request.error));
  });
}

function weatherKey(location: SavedLocation): string {
  const { latitude, longitude } = location.location.coordinates;
  return `${location.providerId}:${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

export async function loadWeather(
  location: SavedLocation,
): Promise<WeatherResponse | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(WEATHER_STORE_NAME, "readonly");
    const request = transaction
      .objectStore(WEATHER_STORE_NAME)
      .get(weatherKey(location));
    request.addEventListener("success", () => {
      const parsed = WeatherResponseSchema.safeParse(request.result);
      resolve(parsed.success ? parsed.data : undefined);
    });
    request.addEventListener("error", () => reject(request.error));
  });
}

export async function saveWeather(
  location: SavedLocation,
  weather: WeatherResponse,
): Promise<void> {
  const database = await openDatabase();
  const validated = WeatherResponseSchema.parse(weather);
  const key = weatherKey(location);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WEATHER_STORE_NAME, "readwrite");
    const store = transaction.objectStore(WEATHER_STORE_NAME);
    store.put(validated, key);
    pruneWeatherStore(store, key);
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  });
}

export async function saveSelectedLocation(
  savedLocation: SavedLocation,
): Promise<void> {
  const validated = SavedLocationSchema.parse(savedLocation);
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction
      .objectStore(STORE_NAME)
      .put(validated, SELECTED_LOCATION_KEY);
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  });
}
