import type {
  ProviderDescriptor,
  ResolvedLocation,
  SavedLocation,
  WeatherResponse,
} from "@weather/contracts";
import { useEffect, useState } from "react";

import { fetchProviders, fetchWeather, searchLocations } from "./api.js";
import {
  loadSelectedLocation,
  loadWeather,
  saveSelectedLocation,
  saveWeather,
} from "./location-storage.js";
import {
  WeatherPage,
  type ForecastState,
  type SearchState,
} from "./WeatherPage.js";

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 5 * 60 * 1_000,
      timeout: 10_000,
    });
  });
}

function deviceLocation(position: GeolocationPosition): ResolvedLocation {
  const latitude = Math.round(position.coords.latitude * 100_000) / 100_000;
  const longitude = Math.round(position.coords.longitude * 100_000) / 100_000;

  return {
    id: `coordinates:${latitude},${longitude}`,
    displayName: "Current location",
    kind: "coordinates",
    coordinates: {
      latitude,
      longitude,
      ...(position.coords.altitude === null
        ? {}
        : { elevationMetres: position.coords.altitude }),
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResolvedLocation[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [selected, setSelected] = useState<SavedLocation>();
  const [locationMessage, setLocationMessage] = useState("");
  const [weather, setWeather] = useState<WeatherResponse>();
  const [forecastState, setForecastState] = useState<ForecastState>("idle");
  const [forecastMessage, setForecastMessage] = useState("");
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetchProviders(controller.signal)
      .then((availableProviders) => {
        setProviders(availableProviders);
        setProvidersLoaded(true);
        setProviderMessage("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProvidersLoaded(true);
        setProviderMessage("Provider choices could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    void loadSelectedLocation()
      .then(setSelected)
      .catch(() => setLocationMessage("Saved location could not be loaded."));
  }, []);

  useEffect(() => {
    if (
      selected === undefined ||
      providers.length === 0 ||
      providers.some((provider) => provider.id === selected.providerId)
    ) {
      return;
    }
    void selectProvider(providers[0]?.id ?? "open-meteo");
  }, [providers, selected]);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 3) {
      setResults([]);
      setSearchState("idle");
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSearchState("loading");
      void searchLocations(trimmedQuery, controller.signal)
        .then((locations) => {
          setResults(locations);
          setSearchState("success");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setResults([]);
          setSearchState("error");
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!selected || !providersLoaded) return undefined;
    if (
      providers.length > 0 &&
      !providers.some((provider) => provider.id === selected.providerId)
    ) {
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    void loadWeather(selected)
      .catch(() => undefined)
      .then((cached) => {
        if (!active) return;
        const isFresh =
          cached !== undefined &&
          new Date(cached.metadata.expiresAt).getTime() > Date.now();

        if (cached) {
          setWeather(cached);
          setForecastState(isFresh ? "success" : "refreshing");
        } else {
          setWeather(undefined);
          setForecastState("loading");
        }
        setForecastMessage("");

        const providerSupportsAirQuality =
          providers.find((provider) => provider.id === selected.providerId)
            ?.capabilities.airQuality ?? selected.providerId === "open-meteo";
        const providerSupportsPollen =
          providers.find((provider) => provider.id === selected.providerId)
            ?.capabilities.pollen ?? selected.providerId === "open-meteo";
        const airQualityIsFresh =
          !providerSupportsAirQuality ||
          (cached?.airQuality !== undefined &&
            new Date(cached.airQuality.metadata.expiresAt).getTime() >
              Date.now());
        const pollenIsFresh =
          !providerSupportsPollen ||
          (cached?.pollen !== undefined &&
            new Date(cached.pollen.metadata.expiresAt).getTime() > Date.now());

        if (isFresh && airQualityIsFresh && pollenIsFresh) return;

        void fetchWeather(
          selected.location,
          selected.providerId,
          !airQualityIsFresh,
          !pollenIsFresh,
          controller.signal,
        )
          .then(async (fetchedWeather) => {
            if (!active) return;
            const reusableAirQuality =
              cached?.airQuality !== undefined &&
              new Date(cached.airQuality.metadata.staleAfter).getTime() >
                Date.now()
                ? cached.airQuality
                : undefined;
            const reusablePollen =
              cached?.pollen !== undefined &&
              new Date(cached.pollen.metadata.staleAfter).getTime() > Date.now()
                ? cached.pollen
                : undefined;
            const nextWeather = {
              ...fetchedWeather,
              ...(fetchedWeather.airQuality !== undefined ||
              reusableAirQuality === undefined
                ? {}
                : { airQuality: reusableAirQuality }),
              ...(fetchedWeather.pollen !== undefined || reusablePollen === undefined
                ? {}
                : { pollen: reusablePollen }),
            };
            setWeather(nextWeather);
            setForecastState("success");
            setForecastMessage("");
            await saveWeather(selected, nextWeather).catch(() => undefined);
          })
          .catch((error: unknown) => {
            if (!active || (error instanceof DOMException && error.name === "AbortError")) {
              return;
            }
            setForecastState("error");
            setForecastMessage(
              cached
                ? "Could not refresh. Showing the last saved forecast."
                : "Forecast data is temporarily unavailable.",
            );
          });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [providers, providersLoaded, selected]);

  async function selectLocation(location: ResolvedLocation) {
    const savedLocation: SavedLocation = {
      location,
      providerId: selected?.providerId ?? providers[0]?.id ?? "open-meteo",
      savedAt: new Date().toISOString(),
    };

    setSelected(savedLocation);
    setQuery("");
    setResults([]);
    setLocationMessage("");

    try {
      await saveSelectedLocation(savedLocation);
    } catch {
      setLocationMessage("Location selected, but it could not be saved offline.");
    }
  }

  async function selectProvider(providerId: string) {
    if (selected === undefined || selected.providerId === providerId) return;
    const nextSelection: SavedLocation = {
      ...selected,
      providerId,
      savedAt: new Date().toISOString(),
    };
    setSelected(nextSelection);
    setWeather(undefined);
    setForecastState("loading");
    setForecastMessage("");
    try {
      await saveSelectedLocation(nextSelection);
    } catch {
      setProviderMessage("Provider changed, but it could not be saved offline.");
    }
  }

  async function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocationMessage("This browser does not support device location.");
      return;
    }

    setLocationMessage("Finding your location…");

    try {
      await selectLocation(deviceLocation(await currentPosition()));
    } catch {
      setLocationMessage(
        "Location access was unavailable. Search for a place instead.",
      );
    }
  }

  return (
    <WeatherPage
      query={query}
      results={results}
      searchState={searchState}
      forecastState={forecastState}
      providers={providers}
      weatherStale={
        weather !== undefined &&
        new Date(weather.metadata.expiresAt).getTime() <= Date.now()
      }
      {...(selected === undefined ? {} : { selected })}
      {...(locationMessage ? { locationMessage } : {})}
      {...(weather === undefined ? {} : { weather })}
      {...(forecastMessage ? { forecastMessage } : {})}
      {...(providerMessage ? { providerMessage } : {})}
      onQueryChange={setQuery}
      onSelectLocation={(location) => void selectLocation(location)}
      onUseCurrentLocation={() => void useCurrentLocation()}
      onSelectProvider={(providerId) => void selectProvider(providerId)}
    />
  );
}
