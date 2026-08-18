# Weather provider capability research

Research checked on **2026-08-15** against provider-owned documentation. Pricing, quotas, field availability, and product boundaries can change; re-check a profile before implementing its adapter.

Application integrations were last live-checked on **2026-08-17**. This index
keeps upstream capability, configured account access, and mapped application
output separate: a provider can offer a field that our key cannot access, or our
adapter may intentionally not map yet.

## Vocabulary

Every profile uses the same availability labels:

| Label | Meaning |
| --- | --- |
| Yes | Verified in the provider's official documentation. |
| Limited | Available only for a shorter period, region, granularity, or reduced field set. |
| Separate | Available, but from another upstream endpoint or product. |
| Tier-dependent | Documented, but access depends on subscription. |
| No verified support | Not found in the current official developer documentation. |

## Application integration matrix

The counts below are observed canonical output for Lutsk during live checks on
2026-08-16 and 2026-08-17, not
contractual provider maxima. They can vary with time, location, plan, and
upstream horizon.

| Provider | Adapter / configured access | Current | Hourly output | Daily output | AQ in app | Important implementation finding |
| --- | --- | --- | --- | --- | --- | --- |
| [Open-Meteo](open-meteo.md) | Live, keyless | Model nowcast | 24 × 1 hour | 7 native | Connected on demand via separate API | Sunrise, hourly/daily UV, and visibility are mapped. |
| [MET Norway](met-norway.md) | Live, identified user agent | Model near-now | 24 variable steps | 7 derived | Not connected | Sunrise and visibility distance are not in Locationforecast; UV coverage shortens with range. |
| [Visual Crossing](visual-crossing.md) | Live, keyed | Observation | 24 × 1 hour | 7 native | Connected from shared Timeline call | Weather and AQ map once and cache independently; PM1 is preserved in the shared schema. |
| [OpenWeather](openweather.md) | Live, keyed standard APIs | Observation | 8 × 3 hours | 6 derived | Connected on demand via separate API | This account has Current + 5 Day / 3 Hour and Air Pollution access, not One Call 3.0; only current-day sunrise is mapped and UV is absent. |
| [WeatherAPI.com](weatherapi.md) | Adapter implemented; production disabled | — | — | — | Disabled in production | Live comparisons returned implausible temperatures; retain the adapter for investigation but do not re-enable without approval. |
| [Pirate Weather](pirate-weather.md) | Live, keyed Forecast v2 | Model near-now | 24 × 1 hour | 7 native | Connected from shared forecast call | Weather and AQ map once and cache independently; AQ details are requested only on demand. |
| [Tomorrow.io](tomorrow-io.md) | Live, keyed convenience Forecast | Forecast near-now | 24 × 1 hour | 6 returned | Mapping ready; configured plan restricted | Sunrise, UV, and visibility are mapped. AQ is capability-gated to avoid rejected requests and wasted quota. |
| [Weatherbit](weatherbit.md) | Live, keyed Current + Daily tier | Observation | Unavailable | 7 native | Current US EPA AQI connected | AQI comes from the existing current-weather call; full AQ/pollen endpoints and Hourly Weather return `403` on this key. |
| [UK Met Office](uk-met-office.md) | Live, keyed Global Spot free plan | Forecast near-now | 24 × 1 hour | 7 native | Not connected | One app load uses hourly + daily calls. The Lutsk response came from a nearest site 58.4 km away; that provenance is exposed in the UI. |
| [Weatherstack](weatherstack.md) | Excluded; free tier is current-only | — | — | — | No adapter planned | Free plan is limited to 100 calls/month and does not provide forecast access. |
| [AccuWeather](accuweather.md) | Excluded; no ongoing free tier | — | — | — | No adapter planned | Free access is a 14-day trial only; continued use requires a paid plan. |

The profiles distinguish these concepts rather than treating them as interchangeable:

- **Current**: a provider's latest observation, analysis, or model estimate.
- **Hourly / daily**: the temporal interval returned by the provider, not a precision inferred by us.
- **Point / nearest site / grid / administrative area / region**: the spatial meaning of the value.
- **AQI scale**: the named index standard. AQI numbers are not comparable unless their scales match.
- **Pollutant concentration**: a measured or modelled concentration with its original unit.
- **Same request**: air-quality fields can be returned by the normal forecast request.
- **Separate request**: the adapter must call another upstream endpoint.
- **Separate product**: access, licensing, or delivery differs from the normal developer weather API.

## Air-quality boundary matrix

| Provider | AQ support | Upstream boundary | AQ granularity | Pollen | App integration | Important limitation |
| --- | --- | --- | --- | --- | --- | --- |
| [Open-Meteo](open-meteo.md) | Yes | Separate API | Current + hourly | Europe, hourly | AQ + pollen connected; one shared request when both selected | European and global model domains have different resolution/cadence. |
| [Visual Crossing](visual-crossing.md) | Yes | Same Timeline request, optional elements | Current + hourly; daily upstream | No verified support | Connected, shared upstream request | AQ becomes null after its five-day horizon while weather continues. |
| [OpenWeather](openweather.md) | Yes | Separate API | Current + hourly forecast/history | No verified support | Connected, optional bundle resource | Uses OpenWeather's own 1–5 AQI, not US EPA AQI. |
| [WeatherAPI.com](weatherapi.md) | Yes | Same weather request, opt-in AQ/pollen | Current + hourly when configured | Selected regions; current + hourly | Adapter supports AQ + pollen; production disabled | Configured feed returned implausible weather temperatures, so none of its resources are exposed in production. |
| [Pirate Weather](pirate-weather.md) | Yes | Same Forecast v2 request with `include=airqualitydetails` | Current + hourly; daily summary upstream | No verified support | Connected, shared upstream request | SI requests produce EU CAQI; pollutant units are preserved. |
| [MET Norway](met-norway.md) | Limited | Separate API/product | Hourly forecast | No verified support | Not connected | AQ product covers Norway only and is marked changeable/beta-like. |
| [UK Met Office](uk-met-office.md) | Limited | Separate commercial data product | Product-specific | Separate UK product | Weather connected; AQ not connected | Not part of the self-service Weather DataHub Global Spot API. |
| [Tomorrow.io](tomorrow-io.md) | Yes | Same Timeline request, selected fields | Current/hourly subject to field/tier | Yes | AQ and pollen disabled for configured key | Live key returns `403` for AQ/pollen-only requests and omits those fields from mixed requests. |
| [Weatherbit](weatherbit.md) | Yes | Current weather carries AQI; full AQ and pollen use separate APIs | Current summary in app; 72-hour hourly AQ upstream | Current 0–4 categories in supported US/EU regions | Current AQI connected; full AQ/pollen API restricted | Live `current/airquality` call returns `403`; no pollutants, hourly AQ, or pollen are inferred from the weather summary. |
| [Weatherstack](weatherstack.md) | Yes | Same current/forecast response on paid plans | Current + daily verified | No verified support | Excluded; no adapter planned | Free tier is current-only with 100 calls/month, so it cannot support the app's forecast experience. |
| [AccuWeather](accuweather.md) | Limited | Daily forecast extended details; Indices API alternative | Daily index/category | Daily pollen indices | Excluded; no adapter planned | No ongoing free tier; the 14-day trial does not fit this project's provider requirements. |

## Recommendation

Keep **weather**, **air quality**, and **pollen** as separate canonical resources, then let a forecast bundle include any combination of them.

```text
GET /v1/weather?provider=open-meteo&lat=...&lon=...&include=airQuality,pollen
                                   |
                                   +-- weather adapter request
                                   +-- environmental request only when requested
                                   +-- independent cache entries and freshness
```

This gives the UI one convenient response while preserving the real upstream differences:

- A provider adapter can make one request or fan out to several without leaking that detail to clients.
- The server can omit AQ when the client does not show it, avoiding unnecessary quota use.
- Weather and AQ can have different `fetchedAt`, `staleAfter`, `expiresAt`, temporal coverage, and spatial provenance.
- A failed AQ request does not invalidate otherwise usable weather data.
- Providers with a three- or five-day AQ horizon do not force the weather forecast to the same horizon.
- MET Norway and Met Office regional environmental products can accurately report unsupported locations.

The implemented weather response therefore contains independently optional
resources instead of adding AQ fields to every weather hour/day:

```ts
type WeatherResponse = {
  schemaVersion: 1;
  location: ResolvedLocation;
  current?: CurrentWeather;
  hourly?: HourlyWeatherPoint[];
  daily?: DailyWeatherPoint[];
  airQuality?: AirQualityResource;
  pollen?: PollenResource;
  partialFailures?: ResourceFailure[];
  metadata: WeatherMetadata;
};
```

For Open-Meteo, the API makes Forecast and environmental calls concurrently,
combines AQ and pollen fields into one upstream environmental call when both are
needed, caches all three resources separately, and returns weather when an
optional environmental resource fails.

When configured for investigation, the disabled WeatherAPI.com adapter can use
one Forecast request for weather, AQ, and pollen. It fans that response into
three independently cached resources, so a simultaneous miss costs one provider
request while later refreshes follow each resource's own expiry.

## Normalization rules implied by the research

- Preserve the AQI `scale` alongside every value: `us-epa`, `european-aqi`, `uk-defra`, `openweather-1-5`, `eu-caqi`, and so on.
- WeatherAPI.com's 1–6 `us-epa-index` is a category code, not the numeric 0–500 US EPA AQI. Store it as `weatherapi-us-epa-category` rather than `us-epa`.
- Visual Crossing's `aqieur` is a 1–6 category index, not the continuous European AQI used by Open-Meteo. Store it as `visual-crossing-european-category` and retain `aqius` separately as numeric US EPA AQI.
- Do not convert gas concentrations between `ppb`, `ppm`, and `µg/m³` without an explicit temperature/pressure convention. Store `{ value, unit }`.
- Store particulate matter as provider-supplied mass concentration, normally `µg/m³`.
- Give each series its own temporal granularity and coverage window.
- Record spatial semantics such as point/grid, nearest site, administrative area, or regional forecast.
- Distinguish observation, model, and blended values where a provider exposes that provenance.
- Missing or unavailable fields remain absent; they never become zero.
- Provider plan restrictions belong in adapter capability metadata and user-facing feature labels.
