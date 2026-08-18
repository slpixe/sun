# Weatherstack

Research checked: **2026-08-17**

## Application status

**Decision: excluded from the planned application integrations.** Weatherstack
has an ongoing free plan, but it is limited to 100 calls per month and
real-time weather. Forecast access starts on a paid plan, so the free offering
cannot supply this application's hourly and multi-day forecast experience. We
will not add an adapter or request an API key.

## Product and location model

| Item | Details |
| --- | --- |
| Weather APIs | Current, Forecast, Historical, Historical Time-Series, Autocomplete, Bulk, and Marine endpoint families. |
| Location input | City/region name, ZIP/postal code, latitude/longitude, and IP-based lookup; plan support varies. |
| Spatial meaning | Matched location/city returned with coordinates, region, country, and timezone. |
| Coverage | Global current, forecast, and historical weather for millions of locations. |
| Forecast horizon | Seven, ten, or fourteen days depending on plan. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | `/current`. |
| Minutely | No verified support | Not listed as a product capability. |
| Hourly | Yes | Hour-by-hour records in Forecast and Historical responses. |
| Daily | Yes | Forecast day objects. |
| Alerts | No verified support | No alert product is listed in the current public product/API materials. |
| History | Yes | Historical and time-series endpoint families; documented back to 2008 depending on plan. |
| Sunrise / sunset | Yes | Daily `astro` object. |
| UV | Yes | Current, hourly, and daily examples. |
| Visibility | Yes | Current/hourly examples. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Yes | Official response examples include `air_quality` in current and forecast day objects. |
| AQ temporal granularity | Limited verification | Current and daily are verified. Current public documentation/examples do not clearly establish an hourly pollutant series. |
| AQI scales | Yes | US EPA category index 1–6 and UK DEFRA index 1–10. |
| Pollutants | Yes | CO, NO2, O3, SO2, PM2.5, and PM10 in the response object. |
| Pollen | No verified support | Not listed in the current product capabilities. |

## Adapter boundary

Classification: **not planned because the free tier has no forecast access**.
The technical boundary below is retained as research only.

If reconsidered on a paid plan, map current and daily AQ objects as their
documented granularities. Do not copy a daily AQ value into every hour. Because
the current APILayer-hosted documentation is partly client-rendered and plan
packaging changes, verify a subscribed live response before finalizing the
provider schema.

## Sources

- [Weatherstack product and response examples](https://weatherstack.com/)
- [Weatherstack pricing and plan capabilities](https://weatherstack.com/pricing)
- [Weatherstack API status/product endpoint list](https://weatherstack.com/api-status)
- [APILayer Weatherstack documentation](https://docs.apilayer.com/weatherstack/docs/api-documentation)
