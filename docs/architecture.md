# Architecture

## Shape

The browser resolves a user-entered place into a canonical location, then requests weather by provider and WGS84 coordinates. Weather providers are hidden behind server-side adapters and mapped into the shared weather domain.

```text
place search -> canonical location -> selected provider adapter
                                      -> canonical weather response
                                      -> Fastify API
                                      -> PWA / IndexedDB
```

## Decisions

- pnpm workspaces and Turborepo manage the monorepo.
- React and Vite provide the PWA.
- Fastify provides the HTTP API.
- Zod schemas are the runtime and TypeScript source of truth.
- Weather, air quality, and pollen are separate canonical resources because their coverage, granularity, freshness, and upstream availability differ.
- The public endpoint returns a convenient bundle with independently optional weather, air-quality, and pollen sections. Adapters may fetch or cache those resources independently when their upstream APIs require it.
- Clients explicitly request environmental sections. Adapters must not spend provider quota on air quality or pollen when the client does not need them.
- When weather and AQ share one upstream response, a combined provider method fans that single request into independently cached canonical resources. Concurrent weather/AQ misses share the same in-flight call rather than duplicating provider quota.
- Open-Meteo AQ and pollen share one Air Quality API call when both cache entries need loading, while retaining separate canonical freshness and cache keys.
- The WeatherAPI.com adapter can fan one Forecast response into weather, AQ,
  and pollen cache entries; concurrent misses share that one in-flight provider
  call. It is intentionally disabled in production after unreliable live
  temperature results and must not be re-enabled without a new investigation.
- Plan-dependent combined methods are registered only when configured access is known to support their fields. Tomorrow.io AQ is therefore capability-gated instead of probing a restricted field set on every user request.
- User-selected locations, providers, preferences, and last-known responses live in IndexedDB.
- The browser weather cache removes responses after `staleAfter` and retains at
  most the 24 most recently fetched provider/location responses. Preferences and
  the selected location are not subject to that limit.
- Static PWA resources use service-worker Cache Storage.
- Production weather caching uses the optional Upstash Redis REST adapter so cache entries and provider-budget counters are shared across serverless instances; process memory remains the development fallback.
- There is no server-side database initially.
- Provider selection is explicit. An adapter must not silently substitute a different provider.
- The provider registry contains every configured adapter. The API routes by provider ID, and the browser persists that selection independently for each saved forecast cache key.
- Provider-registry responses are browser-cacheable for five minutes and
  CDN-cacheable for one day because configured provider availability changes
  only with API runtime configuration or deployment.
- Field availability and granularity remain explicit. Adapters must preserve whether data is current, hourly, or daily and whether it represents a point/grid, city, region, or wider model domain. The UI may label that provenance; it must not imply finer temporal or spatial precision than the provider supplies.

## Location flow

Location search is separate from weather retrieval:

1. Open-Meteo name/postcode search or device geolocation produces a canonical WGS84 coordinate.
2. The browser stores display name, coordinates, timezone, optional elevation, and selected provider.
3. Weather adapters receive the canonical location.
4. Adapters may resolve provider-native identifiers internally. AccuWeather is a researched (but excluded) example that would require resolving coordinates to a location key.

Device geolocation does not require reverse geocoding for weather retrieval. Until a dedicated reverse-geocoding adapter is introduced, it is displayed as `Current location` with the device timezone.

## Caching

Cache keys include the API schema version, resource, provider, and normalized coordinates. Unit and theme preferences are excluded because the API uses canonical units and presentation conversion happens in clients.

```text
{resource}:v1:{provider}:{latitude}:{longitude}[:{elevation}][:{timezone}]
```

Coordinates are rounded to four decimal places (roughly 11 metres of latitude) to prevent insignificant coordinate noise from fragmenting the cache. Elevation is included for weather requests when supplied, but excluded from Open-Meteo air-quality keys because that upstream request does not use it. The location timezone is part of weather keys because providers such as MET Norway derive daily groups in local time; it is excluded from timezone-independent environmental resources.

Each resource records `fetchedAt`, `expiresAt`, and `staleAfter`. Fresh entries are returned without an upstream call. Expired entries trigger a refresh, but remain eligible as stale fallback until `staleAfter`. Concurrent misses or refreshes for the same key share one in-flight provider request.

Weather metadata can also record the upstream source location and its distance
from the requested coordinate. Nearest-site providers such as Met Office Global
Spot expose this provenance so clients do not imply exact-city spatial
precision.

MET Norway supplies authoritative `Expires` and `Last-Modified` response headers. Its adapter retains the latter in canonical metadata and uses `If-Modified-Since` when the shared resource cache refreshes an expired entry. A `304 Not Modified` response renews freshness without downloading or remapping the forecast body.

Provider-specific policies override application defaults and must comply with
provider retention and attribution terms. A partial upstream failure may omit
one requested resource without invalidating fresher, successfully retrieved
resources. Cache-storage read or write failures are logged but do not make
successfully fetched provider data unavailable.

`UpstashRedisStore` implements both `WeatherCache` and atomic UTC-day provider
load budgets over the Redis REST API. Cache entries expire at `staleAfter`, so
the shared store can still supply stale-if-error responses after normal
freshness expires. A budget is consumed only when a cache miss or expired entry
actually starts a provider load; fresh cache hits do not spend it. Once a
budget is exhausted, stale entries remain eligible and uncached requests receive
`429` with `Retry-After` and the UTC reset time. `InMemoryWeatherCache` and
`InMemoryProviderLoadBudget` provide the same behavior locally, but their state
is not shared across serverless instances.

## Environmental data

Air-quality indices retain their named provider scale. A value using US EPA AQI, UK DAQI, European AQI, EU CAQI, or a provider-specific scale must not be presented as though it belongs to another scale.

Pollutant values retain an explicit unit. In particular, adapters must not silently convert gas concentrations between `ppb`, `ppm`, and `µg/m³`; such a conversion requires a documented temperature and pressure convention. Spatial metadata records whether environmental data represents a point/grid cell, nearest site, station, administrative area, or region.

Provider capabilities and upstream boundaries are recorded in the [provider research](providers/README.md).
