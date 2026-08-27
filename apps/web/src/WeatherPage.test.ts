import { describe, expect, it } from "vitest";

import { nextActiveResultIndex } from "./WeatherPage.js";

describe("nextActiveResultIndex", () => {
  it("starts at the first result when moving down", () => {
    expect(nextActiveResultIndex(-1, 3, 1)).toBe(0);
  });

  it("starts at the last result when moving up", () => {
    expect(nextActiveResultIndex(-1, 3, -1)).toBe(2);
  });

  it("wraps in either direction", () => {
    expect(nextActiveResultIndex(2, 3, 1)).toBe(0);
    expect(nextActiveResultIndex(0, 3, -1)).toBe(2);
  });

  it("does not activate a result when the list is empty", () => {
    expect(nextActiveResultIndex(-1, 0, 1)).toBe(-1);
  });
});
