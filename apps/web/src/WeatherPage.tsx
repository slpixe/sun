import type {
  LocationKind,
  ProviderDescriptor,
  ResolvedLocation,
  SavedLocation,
  WeatherResponse,
} from "@weather/contracts";
import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { ProviderChooser } from "./ProviderChooser.js";
import { WeatherView } from "./WeatherView.js";

export type SearchState = "idle" | "loading" | "success" | "error";
export type ForecastState = "idle" | "loading" | "refreshing" | "success" | "error";

const LOCATION_KIND_LABEL: Record<LocationKind, string> = {
  city: "City",
  town: "Town",
  village: "Village",
  airport: "Airport",
  postcode: "Postcode",
  point_of_interest: "Place",
  coordinates: "Coordinates",
  other: "Place",
};

const QUICK_LOCATIONS = [
  {
    label: "London, UK",
    location: {
      id: "quick:london-uk",
      displayName: "London, United Kingdom",
      kind: "city",
      coordinates: { latitude: 51.5074, longitude: -0.1278 },
      timezone: "Europe/London",
    },
  },
  {
    label: "Birmingham, UK",
    location: {
      id: "quick:birmingham-uk",
      displayName: "Birmingham, United Kingdom",
      kind: "city",
      coordinates: { latitude: 52.4862, longitude: -1.8904 },
      timezone: "Europe/London",
    },
  },
  {
    label: "Tokyo, Japan",
    location: {
      id: "quick:tokyo-japan",
      displayName: "Tokyo, Japan",
      kind: "city",
      coordinates: { latitude: 35.6762, longitude: 139.6503 },
      timezone: "Asia/Tokyo",
    },
  },
  {
    label: "California, USA",
    location: {
      id: "quick:california-usa",
      displayName: "California, United States",
      kind: "coordinates",
      coordinates: { latitude: 37.2502, longitude: -119.7513 },
      timezone: "America/Los_Angeles",
    },
  },
  {
    label: "Warsaw, Poland",
    location: {
      id: "quick:warsaw-poland",
      displayName: "Warsaw, Poland",
      kind: "city",
      coordinates: { latitude: 52.2297, longitude: 21.0122 },
      timezone: "Europe/Warsaw",
    },
  },
] satisfies readonly { label: string; location: ResolvedLocation }[];

export interface LocationPickerProps {
  query: string;
  results: ResolvedLocation[];
  searchState: SearchState;
  message?: string;
  showQuickLocations?: boolean;
  onQueryChange(query: string): void;
  onSelectLocation(location: ResolvedLocation): void;
  onUseCurrentLocation(): void;
}

export function nextActiveResultIndex(
  currentIndex: number,
  resultCount: number,
  direction: 1 | -1,
) {
  if (resultCount === 0) return -1;
  if (currentIndex < 0) return direction === 1 ? 0 : resultCount - 1;
  return (currentIndex + direction + resultCount) % resultCount;
}

function DeviceLocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle className="device-location-icon-dot" cx="12" cy="12" r="2" />
    </svg>
  );
}

export function LocationPicker({
  query,
  results,
  searchState,
  message,
  showQuickLocations = false,
  onQueryChange,
  onSelectLocation,
  onUseCurrentLocation,
}: LocationPickerProps) {
  const resultsId = useId();
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const activeResult = results[activeResultIndex];

  useEffect(() => {
    setActiveResultIndex(-1);
  }, [query, results]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setActiveResultIndex((currentIndex) =>
        nextActiveResultIndex(
          currentIndex,
          results.length,
          event.key === "ArrowDown" ? 1 : -1,
        ),
      );
      return;
    }

    if (event.key === "Enter" && activeResult !== undefined) {
      event.preventDefault();
      onSelectLocation(activeResult);
      return;
    }

    if (event.key === "Escape" && activeResultIndex >= 0) {
      event.preventDefault();
      setActiveResultIndex(-1);
    }
  }

  return (
    <div className="location-picker">
      <label htmlFor={`${resultsId}-search`}>Find a place</label>
      <div className="search-row">
        <input
          id={`${resultsId}-search`}
          type="search"
          value={query}
          placeholder="City or postcode"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={resultsId}
          aria-expanded={results.length > 0}
          {...(activeResult === undefined
            ? {}
            : { "aria-activedescendant": `${resultsId}-option-${activeResultIndex}` })}
          onChange={(event) => {
            setActiveResultIndex(-1);
            onQueryChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="device-location-button"
          aria-label="Use device location"
          title="Use device location"
          onClick={onUseCurrentLocation}
        >
          <DeviceLocationIcon />
        </button>
      </div>
      <div id={resultsId} className="search-results" role="listbox">
        {results.map((location, index) => (
          <button
            key={location.id}
            id={`${resultsId}-option-${index}`}
            type="button"
            role="option"
            aria-selected={activeResultIndex === index}
            onMouseEnter={() => setActiveResultIndex(index)}
            onClick={() => onSelectLocation(location)}
          >
            <span>{location.displayName}</span>
            <small>
              {LOCATION_KIND_LABEL[location.kind]} · {location.timezone}
            </small>
          </button>
        ))}
      </div>
      <div className="search-message" aria-live="polite">
        {searchState === "loading" && "Searching…"}
        {searchState === "success" && results.length === 0 && "No places found."}
        {searchState === "error" && "Location search is temporarily unavailable."}
        {message}
      </div>
      {showQuickLocations && query.trim().length === 0 && (
        <div className="quick-locations" aria-label="Suggested locations">
          <p>Popular places</p>
          <div>
            {QUICK_LOCATIONS.map(({ label, location }) => (
              <button
                key={location.id}
                type="button"
                onClick={() => onSelectLocation(location)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface SelectedLocationCardProps {
  selected: SavedLocation;
  currentInstant?: string;
}

export function SelectedLocationCard({
  selected,
  currentInstant,
}: SelectedLocationCardProps) {
  const { location } = selected;
  const [now, setNow] = useState(() =>
    currentInstant === undefined ? new Date() : new Date(currentInstant),
  );

  useEffect(() => {
    if (currentInstant !== undefined) {
      setNow(new Date(currentInstant));
      return undefined;
    }

    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, [currentInstant]);

  const localTime = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: location.timezone,
  }).format(now);

  return (
    <article className="selected-location">
      <div>
        <p className="card-label">Selected location</p>
        <h2>{location.displayName}</h2>
        <p>
          {LOCATION_KIND_LABEL[location.kind]} · {" "}
          {location.coordinates.latitude.toFixed(3)}, {" "}
          {location.coordinates.longitude.toFixed(3)} · {location.timezone}
        </p>
      </div>
      <div className="selected-location-time">
        <span>Local time</span>
        <time dateTime={now.toISOString()}>{localTime}</time>
      </div>
    </article>
  );
}

export function ForecastLoading() {
  return (
    <section className="forecast-loading" aria-live="polite">
      <span className="loading-orb" />
      <div>
        <strong>Fetching the forecast</strong>
        <p>Current conditions, hourly outlook, and the next seven days.</p>
      </div>
    </section>
  );
}

export interface WeatherPageProps {
  query: string;
  results: ResolvedLocation[];
  searchState: SearchState;
  selected?: SavedLocation;
  locationMessage?: string;
  weather?: WeatherResponse;
  forecastState: ForecastState;
  forecastMessage?: string;
  providers: ProviderDescriptor[];
  providerMessage?: string;
  weatherStale?: boolean;
  currentInstant?: string;
  onQueryChange(query: string): void;
  onSelectLocation(location: ResolvedLocation): void;
  onUseCurrentLocation(): void;
  onSelectProvider(providerId: string): void;
}

export function WeatherPage({
  query,
  results,
  searchState,
  selected,
  locationMessage,
  weather,
  forecastState,
  forecastMessage,
  providers,
  providerMessage,
  weatherStale = false,
  currentInstant,
  onQueryChange,
  onSelectLocation,
  onUseCurrentLocation,
  onSelectProvider,
}: WeatherPageProps) {
  const selectedProvider = providers.find(
    (provider) => provider.id === selected?.providerId,
  );
  return (
    <main className="shell">
      <section className="hero">
        <div className={`page-controls${selected ? " has-provider" : ""}`}>
          <LocationPicker
            query={query}
            results={results}
            searchState={searchState}
            showQuickLocations={selected === undefined}
            {...(locationMessage === undefined ? {} : { message: locationMessage })}
            onQueryChange={onQueryChange}
            onSelectLocation={onSelectLocation}
            onUseCurrentLocation={onUseCurrentLocation}
          />
          {selected && (
            <ProviderChooser
              providers={providers}
              selectedProviderId={selected.providerId}
              {...(providerMessage === undefined
                ? {}
                : { message: providerMessage })}
              onSelect={onSelectProvider}
            />
          )}
        </div>
        {selected && (
          <SelectedLocationCard
            selected={selected}
            {...(currentInstant === undefined ? {} : { currentInstant })}
          />
        )}
        {selected && forecastState === "loading" && <ForecastLoading />}
        {selected && weather && (
          <WeatherView
            weather={weather}
            {...(selectedProvider === undefined
              ? {}
              : { provider: selectedProvider })}
            refreshing={forecastState === "refreshing"}
            stale={weatherStale}
            {...(forecastMessage === undefined
              ? {}
              : { message: forecastMessage })}
          />
        )}
        {selected && forecastState === "error" && !weather && (
          <p className="forecast-error" role="alert">
            {forecastMessage}
          </p>
        )}
      </section>
    </main>
  );
}
