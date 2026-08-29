import { describe, expect, it } from "vitest";

import { isProviderShortcut } from "./ProviderChooser.js";

describe("isProviderShortcut", () => {
  it("recognizes an unmodified lowercase p", () => {
    expect(isProviderShortcut({ key: "p" })).toBe(true);
  });

  it("ignores other keys, modifiers, and handled events", () => {
    expect(isProviderShortcut({ key: "P" })).toBe(false);
    expect(isProviderShortcut({ key: "p", ctrlKey: true })).toBe(false);
    expect(isProviderShortcut({ key: "p", metaKey: true })).toBe(false);
    expect(isProviderShortcut({ key: "p", altKey: true })).toBe(false);
    expect(isProviderShortcut({ key: "p", defaultPrevented: true })).toBe(
      false,
    );
  });
});
