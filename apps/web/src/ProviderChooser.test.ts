import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { isProviderShortcut, ProviderChooser } from "./ProviderChooser.js";
import { mockProviders } from "./stories/fixtures.js";

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

describe("ProviderChooser", () => {
  it("does not render the comparison cards while the dialog is closed", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderChooser, {
        providers: mockProviders,
        selectedProviderId: "open-meteo",
        onSelect: () => undefined,
      }),
    );

    expect(html).toContain("provider-summary");
    expect(html).not.toContain("provider-card");
  });
});
