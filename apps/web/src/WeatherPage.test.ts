import { describe, expect, it } from "vitest";

import {
  isLocationSearchShortcut,
  nextActiveResultIndex,
} from "./WeatherPage.js";

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

describe("isLocationSearchShortcut", () => {
  it("recognizes an unmodified forward slash", () => {
    expect(isLocationSearchShortcut({ key: "/" })).toBe(true);
  });

  it("ignores other keys, modifiers, and handled events", () => {
    expect(isLocationSearchShortcut({ key: "f" })).toBe(false);
    expect(isLocationSearchShortcut({ key: "/", ctrlKey: true })).toBe(false);
    expect(isLocationSearchShortcut({ key: "/", metaKey: true })).toBe(false);
    expect(isLocationSearchShortcut({ key: "/", altKey: true })).toBe(false);
    expect(
      isLocationSearchShortcut({ key: "/", defaultPrevented: true }),
    ).toBe(false);
  });
});
