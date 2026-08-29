import type { ProviderDescriptor } from "@weather/contracts";
import { useEffect, useRef, useState } from "react";

import {
  isEditableTarget,
  isUnmodifiedShortcut,
  type KeyboardShortcutEvent,
} from "./keyboard-shortcuts.js";

interface ProviderChooserProps {
  providers: ProviderDescriptor[];
  selectedProviderId: string;
  message?: string;
  onSelect(providerId: string): void;
}

export function isProviderShortcut(event: KeyboardShortcutEvent) {
  return isUnmodifiedShortcut(event, "p");
}

const CAPABILITY_LABELS = [
  ["current", "Current conditions", true],
  ["hourly", "Hourly forecast", true],
  ["daily", "Daily forecast", true],
  ["alerts", "Weather alerts", false],
  ["historical", "Historical weather", false],
] as const;

const FEATURE_LABELS = [
  ["sunriseSunset", "Sunrise & sunset"],
  ["uv", "UV index"],
  ["visibility", "Visibility"],
  ["airQuality", "Air quality"],
  ["pollen", "Pollen"],
] as const;

function providerProfileLabel(provider: ProviderDescriptor): string {
  const profile = provider.dataProfile;
  if (profile === undefined) return "Provider forecast";
  const spatial =
    profile.weatherSpatial === "grid"
      ? "Model grid"
      : profile.weatherSpatial.replaceAll("_", " ");
  const hourly = {
    hourly: "Hourly",
    three_hourly: "3-hour steps",
    variable_interval: "1h then 6h",
    unavailable: "No hourly forecast",
  }[profile.hourlyGranularity];
  const daily =
    profile.dailyGranularity === "derived"
      ? "Derived daily"
      : "Provider daily";
  return `${spatial} · ${hourly} · ${daily}`;
}

function sourceLabel(source: "forecast" | "separate_api" | "derived") {
  if (source === "separate_api") return "Separate API";
  if (source === "derived") return "Derived";
  return "Main forecast";
}

function featureStatus(
  feature: NonNullable<ProviderDescriptor["featureProfile"]>[keyof NonNullable<
    ProviderDescriptor["featureProfile"]
  >],
) {
  if (feature.availability === "unavailable") {
    return { label: "Unavailable", className: "is-unavailable" };
  }
  if (!feature.integrated) {
    return { label: "Not connected", className: "is-not-connected" };
  }
  if (feature.availability === "limited") {
    return { label: "Limited", className: "is-limited" };
  }
  return { label: "Available", className: "is-available" };
}

export function ProviderChooser({
  providers,
  selectedProviderId,
  message,
  onSelect,
}: ProviderChooserProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedProvider = providers.find(
    (provider) => provider.id === selectedProviderId,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.scrollTop = 0;
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (
        providers.length === 0 ||
        dialogRef.current?.open ||
        !isProviderShortcut(event) ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      setOpen(true);
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [providers.length]);

  function choose(providerId: string) {
    onSelect(providerId);
    setOpen(false);
  }

  return (
    <>
      <section className="provider-control" aria-label="Weather provider">
        <span className="provider-control-label control-label-with-shortcut">
          <span>Weather provider</span>
          <kbd
            className="keyboard-shortcut"
            aria-hidden="true"
            title="Press P to change provider"
          >
            P
          </kbd>
        </span>
        <div className="provider-summary">
          <strong>{selectedProvider?.name ?? selectedProviderId}</strong>
          <button
            type="button"
            className="provider-change-button"
            aria-haspopup="dialog"
            aria-keyshortcuts="p"
            aria-label="Change weather provider"
            disabled={providers.length === 0}
            onClick={() => setOpen(true)}
          >
            Change <span aria-hidden="true">↗</span>
          </button>
        </div>
        {message && <small className="provider-message">{message}</small>}
      </section>

      <dialog
        ref={dialogRef}
        className="provider-dialog"
        aria-labelledby="provider-dialog-title"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="provider-dialog-surface">
          <header className="provider-dialog-header">
            <div>
              <p className="card-label">Forecast sources</p>
              <h2 id="provider-dialog-title">Choose your weather provider</h2>
              <p>
                Compare coverage, forecast granularity, and the extra data each
                source can supply.
              </p>
            </div>
            <button
              type="button"
              className="provider-dialog-close"
              aria-label="Close provider comparison"
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="provider-dialog-content">
            <div className="provider-legend" aria-label="Availability legend">
              <span><i className="is-available" /> Available in this app</span>
              <span><i className="is-not-connected" /> Provider offers it; not connected</span>
              <span><i className="is-unavailable" /> Unavailable</span>
            </div>

            <div className="provider-grid">
              {providers.map((provider) => {
                const isSelected = provider.id === selectedProviderId;
                return (
                  <article
                    key={provider.id}
                    className={`provider-card${isSelected ? " is-selected" : ""}`}
                  >
                    <header>
                      <div>
                        <div className="provider-name-row">
                          <h3>{provider.name}</h3>
                          {isSelected && <span>Selected</span>}
                        </div>
                        <p>{providerProfileLabel(provider)}</p>
                      </div>
                    </header>

                    <section className="provider-feature-group">
                      <h4>Forecast coverage</h4>
                      <ul>
                        {CAPABILITY_LABELS.map(([key, label, integrated]) => {
                          const available = provider.capabilities[key];
                          const status = !available
                            ? { label: "Unavailable", className: "is-unavailable" }
                            : integrated
                              ? { label: "Available", className: "is-available" }
                              : { label: "Not connected", className: "is-not-connected" };
                          return (
                            <li key={key}>
                              <span>{label}</span>
                              <strong className={status.className}>{status.label}</strong>
                            </li>
                          );
                        })}
                      </ul>
                    </section>

                    <section className="provider-feature-group">
                      <h4>Weather details</h4>
                      <ul>
                        {provider.featureProfile === undefined ? (
                          <li><span>Detailed comparison</span><em>Not documented yet</em></li>
                        ) : (
                          FEATURE_LABELS.map(([key, label]) => {
                            const feature = provider.featureProfile?.[key];
                            if (feature === undefined) return null;
                            const status = featureStatus(feature);
                            return (
                              <li key={key} className="provider-feature-detail">
                                <span>
                                  {label}
                                  <small>{sourceLabel(feature.source)} · {feature.detail}</small>
                                </span>
                                <strong className={status.className}>{status.label}</strong>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </section>

                    <button
                      type="button"
                      className="provider-choose-button"
                      disabled={isSelected}
                      onClick={() => choose(provider.id)}
                    >
                      {isSelected ? "Using this provider" : `Use ${provider.name}`}
                    </button>
                  </article>
                );
              })}
            </div>

            <p className="provider-dialog-note">
              Changing provider keeps your selected location. Forecast values
              can differ because providers use different models, grids, and
              update schedules.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
