import {
  LocationSearchResponseSchema,
  ProvidersResponseSchema,
  WeatherResponseSchema,
  type ProviderDescriptor,
  type ResolvedLocation,
  type WeatherResponse,
} from "@weather/contracts";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:3001";

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<ResolvedLocation[]> {
  const url = new URL("/v1/locations/search", API_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("language", navigator.language.slice(0, 2).toLowerCase());

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    throw new Error(`Location search returned ${response.status}`);
  }

  const body: unknown = await response.json();
  return LocationSearchResponseSchema.parse(body).results;
}

export async function fetchProviders(
  signal?: AbortSignal,
): Promise<ProviderDescriptor[]> {
  const response = await fetch(new URL("/v1/providers", API_BASE_URL), {
    headers: { accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw new Error(`Provider registry returned ${response.status}`);
  }
  return ProvidersResponseSchema.parse(await response.json());
}

export async function fetchWeather(
  location: ResolvedLocation,
  providerId: string,
  includeAirQuality: boolean,
  includePollen: boolean,
  signal?: AbortSignal,
): Promise<WeatherResponse> {
  const url = new URL("/v1/weather", API_BASE_URL);
  url.searchParams.set("provider", providerId);
  url.searchParams.set("lat", String(location.coordinates.latitude));
  url.searchParams.set("lon", String(location.coordinates.longitude));
  url.searchParams.set("timezone", location.timezone);
  const includes = [
    ...(includeAirQuality ? ["airQuality"] : []),
    ...(includePollen ? ["pollen"] : []),
  ];
  if (includes.length > 0) {
    url.searchParams.set("include", includes.join(","));
  }
  if (location.coordinates.elevationMetres !== undefined) {
    url.searchParams.set(
      "elevation",
      String(location.coordinates.elevationMetres),
    );
  }

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw new Error(`Weather request returned ${response.status}`);
  }

  const parsed = WeatherResponseSchema.parse(await response.json());
  return { ...parsed, location };
}
