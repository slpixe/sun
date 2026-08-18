# UK Met Office

Research and application integration checked: **2026-08-17**

## Application status

The Global Spot free plan is configured and the weather adapter is live. One
canonical load makes two upstream requests—hourly and daily—and maps a
forecast near-now value, 24 hourly points, and seven daily points.

The configured plan allows 360 requests/day and 10,000/month. The API defaults
Met Office to 100 cache-miss loads/day, or at most 200 upstream calls, leaving
daily headroom for manual checks and retries. Shared cache and budget state can
be persisted across serverless instances with Upstash Redis.

The adapter preserves Global Spot's nearest-site semantics in response
metadata. During the Lutsk live check, the returned site was at 50.58, 26.13,
about 58.4 km from the requested coordinate; the provider did not return a site
name. The web UI shows that distance rather than presenting the forecast as an
exact-city value.

## Product status and location model

| Item | Details |
| --- | --- |
| Current developer platform | Met Office Weather DataHub. |
| Retired platform | DataPoint was retired on 2025-12-01 and must not be used for a new adapter. |
| Main app-suitable weather product | Global Spot, delivered through separate hourly, three-hourly, and daily GeoJSON APIs. |
| Location input | Latitude/longitude. Global Spot returns the nearest available forecast site, not an exact coordinate forecast. |
| Weather spatial meaning | Nearest site from the Global Spot location set; the response reports that site's coordinates. |
| Coverage | Global Spot is global. Higher-detail probabilistic product behavior differs between UK/Northern Europe and the rest of the world. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Limited | The app maps the first hourly point as forecast near-now. It is not an observation. Recent UK observations are a separate Land Observations product. |
| Minutely | No verified support | Not in Global Spot. |
| Hourly | Yes | Dedicated hourly API, 48-hour horizon; the app maps the next 24 points. |
| Three-hourly | Yes | Dedicated API, 168-hour horizon. |
| Daily | Yes | Dedicated API; the app filters past records and maps up to seven days. |
| Alerts | Separate / limited | National Severe Weather Warnings are a separate data/service channel, not part of Global Spot responses. |
| History | Separate / limited | Land Observations supplies recent UK observations; Global Spot is not a general historical weather API. |
| Sunrise / sunset | No verified support | Not established as Global Spot fields in current Weather DataHub documentation. |
| UV | Yes | Hourly UV and native daily maximum UV are mapped. |
| Visibility | Yes | Hourly visibility distance is mapped. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Separate commercial product | UK Air Quality Forecast is advertised as a separate UK product delivered by FTP as site-specific CSV or gridded NetCDF. It is not listed as a self-service Global Spot API. |
| AQ spatial granularity | Product-specific | Site-specific or gridded, UK only. |
| AQI | Yes | Public forecasts use the UK Daily Air Quality Index (DAQI), but the reusable feed contract/fields require product access. |
| Pollutants | Product-specific | The forecast is produced from pollutant emissions, transport, chemistry, aerosols, and deposition; exact reusable feed schema is not public in the Global Spot docs. |
| Pollen | Separate commercial product | UK seasonal pollen feed, regional and daily, delivered as CSV/XML/FTP or other contracted delivery; public site shows five days. |

## Adapter boundary

Classification: **weather implemented; environmental data remains separate
commercial products, not normal Weather DataHub AQ endpoints**.

The Global Spot adapter validates the provider's GeoJSON and makes hourly and
daily calls concurrently. It maps temperature, feels-like temperature,
humidity, precipitation probability, wind, condition, hourly UV and
visibility, daily high/low, and maximum UV. Sunrise/sunset is unavailable.

Do not plan a Met Office AQ adapter until product access, licensing, quotas,
delivery mechanism, and sample schema are confirmed. Its UK-only/site-or-grid
semantics would still map to the same canonical `AirQualityResource`, but an
FTP/file ingestion adapter is materially different from an on-demand
serverless HTTP request.

## Sources

- [Weather DataHub Global Spot overview](https://datahub.metoffice.gov.uk/docs/f/category/site-specific/overview)
- [Weather DataHub site-specific pricing](https://datahub.metoffice.gov.uk/pricing/site-specific)
- [Weather DataHub support and nearest-site behavior](https://datahub.metoffice.gov.uk/support/faqs)
- [Weather DataHub parameter glossary](https://datahub.metoffice.gov.uk/docs/glossary)
- [DataPoint retirement FAQ](https://www.metoffice.gov.uk/services/data/datapoint/datapoint-retirement-faqs)
- [Met Office data products brochure](https://www.metoffice.gov.uk/api/assets/file/met-office-data-products-and-services-brochure-july-2025pdf?prefix=assets)
- [Public air-quality forecast guide](https://weather.metoffice.gov.uk/guides/air-quality-forecast)
- [UK pollen data product description](https://www.metoffice.gov.uk/api/assets/file/uk-seasonal-pollen-forecast-datasheet_2019pdf?prefix=assets)
