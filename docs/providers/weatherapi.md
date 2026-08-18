# WeatherAPI.com

Research checked: **2026-08-17**

## Application status

**Production decision: disabled.** The adapter remains implemented for research
and local testing, but production does not contain a WeatherAPI.com key. During
cross-provider checks on 2026-08-17, the configured feed returned implausible
temperature values for Birmingham and Lutsk that were inconsistent with the
other providers. Do not re-enable it without a fresh reliability investigation
and explicit approval.

| Item | Actual integration |
| --- | --- |
| Adapter | Implemented and live-checked, but intentionally disabled in production. |
| Weather requests | One metric Forecast request by latitude/longitude with seven days requested. Optional AQ and pollen use `aqi=yes` and `pollen=yes` on that same request; all canonical resources are cached independently. |
| Canonical output observed | Current observation, 24 upcoming hourly points, and 7 native daily points. |
| Mapped extras | Daily sunrise/sunset, hourly and daily UV, hourly visibility, precipitation probability, current + 24-hour AQ, and current + 24-hour pollen. AQ preserves both provider indices and six pollutants; pollen preserves seven species in grains/m³. |
| Not mapped | Alerts, history, AQ history, pollen history, and pollen beyond the app's 24-hour display horizon. |

## Product and location model

| Item | Details |
| --- | --- |
| Weather APIs | Realtime, Forecast, History, Future, Astronomy, and other endpoint families. |
| Location input | Latitude/longitude, city, US ZIP, UK/Canadian postcode, METAR or IATA code, IP, or a Search API location ID. |
| Spatial meaning | Matched city/location returned with coordinates, region, country, and timezone. |
| Forecast horizon | Up to 14 days by subscription tier. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | Realtime API and current data in Forecast responses. |
| Minutely | Tier-dependent | Fifteen-minute Forecast/History intervals are Enterprise-only. |
| Hourly | Yes | Forecast day contains hourly records. |
| Daily | Yes | Forecast day summaries. |
| Alerts | Yes | `alerts=yes` in Forecast or a dedicated Alerts API. |
| History | Yes | Weather history from 2010, with plan restrictions. |
| Sunrise / sunset | Yes | `forecastday.astro`; Astronomy API also exists. |
| UV | Yes | Current, hourly, and daily data structures. |
| Visibility | Yes | Current and hourly fields. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Yes | Add `aqi=yes` to Realtime, Forecast, or History. Current and up to three-day AQ forecast depending on plan. |
| AQI scales | Yes | US EPA category index 1–6 and UK DEFRA index 1–10. |
| Pollutants | Yes | CO, O3, NO2, SO2, PM2.5, and PM10 in `µg/m³`. |
| AQ history | Tier-dependent | Documented from 2021-03-01. |
| Pollen | Tier-dependent | Add `pollen=yes`; Hazel, alder, birch, oak, grass, mugwort, and ragweed for cities/towns in the US, Canada, UK, and Europe. Pollen history is Enterprise-only. |

The configured plan was live-checked on 2026-08-17 for Lutsk. It returned current and hourly pollen objects for Hazel, Alder, Birch, Oak, Grass, Mugwort, and Ragweed, alongside current/hourly AQ. The daily forecast object did not contain a pollen summary, so none is inferred.

## Adapter boundary

Classification: **same upstream weather request, opt-in fields**.

Set `aqi=yes` and/or `pollen=yes` only when requested. One response is split into independently cached weather, AQ, and pollen resources; simultaneous cache misses share the same in-flight request. Retain regional pollen coverage and treat genuinely absent fields differently from provider-supplied zero concentrations.

## Sources

- [WeatherAPI.com API documentation](https://www.weatherapi.com/docs/)
- [API changelog](https://www.weatherapi.com/api-changelog.html)
