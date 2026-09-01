import { describe, expect, it } from "vitest";

import {
  MAX_STORED_WEATHER_RESPONSES,
  weatherKeysToEvict,
  type StoredWeatherEntry,
} from "./location-storage.js";

function entry(
  key: string,
  fetchedAt: string,
  staleAfter: string,
): StoredWeatherEntry {
  return { key, value: { metadata: { fetchedAt, staleAfter } } };
}

describe("weatherKeysToEvict", () => {
  it("evicts expired and malformed records", () => {
    const now = Date.parse("2026-09-01T12:00:00Z");
    expect(
      weatherKeysToEvict(
        [
          entry("fresh", "2026-09-01T11:00:00Z", "2026-09-02T12:00:00Z"),
          entry("expired", "2026-08-31T11:00:00Z", "2026-09-01T12:00:00Z"),
          { key: "malformed", value: { metadata: {} } },
        ],
        now,
      ),
    ).toEqual(["expired", "malformed"]);
  });

  it("keeps only the newest records within the configured limit", () => {
    const entries = Array.from(
      { length: MAX_STORED_WEATHER_RESPONSES + 2 },
      (_, index) =>
        entry(
          `forecast-${index}`,
          new Date(Date.UTC(2026, 8, 1, index)).toISOString(),
          "2026-09-10T00:00:00Z",
        ),
    );

    expect(
      weatherKeysToEvict(
        entries,
        Date.parse("2026-09-01T00:00:00Z"),
      ),
    ).toEqual(["forecast-1", "forecast-0"]);
  });

  it("keeps the response that was just saved when enforcing the limit", () => {
    const entries = [
      entry("current", "2026-09-01T08:00:00Z", "2026-09-10T00:00:00Z"),
      entry("newest", "2026-09-01T11:00:00Z", "2026-09-10T00:00:00Z"),
      entry("middle", "2026-09-01T10:00:00Z", "2026-09-10T00:00:00Z"),
    ];

    expect(
      weatherKeysToEvict(
        entries,
        Date.parse("2026-09-01T00:00:00Z"),
        2,
        "current",
      ),
    ).toEqual(["middle"]);
  });
});
