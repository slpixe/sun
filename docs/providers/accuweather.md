# AccuWeather

Research checked: **2026-08-17**

## Application status

**Decision: excluded from the planned application integrations.** AccuWeather
does not offer an ongoing free API tier: its free Core Weather access is a
14-day trial (500 requests per rolling 24 hours), after which continued access
requires a paid plan. That does not fit this project's provider requirements,
so we will not add an adapter or request an API key.

If this decision is revisited, the provider would also require a location-key
adapter that resolves the user's selection to an AccuWeather `locationKey`
before any forecast request.

## Product and location model

| Item | Details |
| --- | --- |
| Main APIs | Core Weather endpoints for Current Conditions, Daily Forecasts, Hourly Forecasts, Alerts, Locations, and Indices. MinuteCast is a separate API family. |
| Location input | Forecast endpoints require an AccuWeather `locationKey`. Resolve it through city/postal/POI search, autocomplete, IP lookup, or geoposition first. |
| Spatial meaning | AccuWeather-defined location represented by the resolved key, not the raw input coordinate alone. |
| Forecast horizon | Hourly endpoints from 1 to 120 hours and daily endpoints from 1 to 15 days, subject to product access. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | Current Conditions by location key. |
| Minutely | Separate | MinuteCast API family. |
| Hourly | Yes | Separate 1/12/24/72/120-hour endpoints. |
| Daily | Yes | Separate 1/5/7/10/15-day endpoints. |
| Alerts | Separate | Government-issued Alerts endpoint by location key. |
| History | Limited | Core Weather exposes recent historical current conditions (6/24 hours); broader archives are enterprise products. |
| Sunrise / sunset | Yes | `Sun` object in detailed daily forecasts. |
| UV | Yes | Current Conditions extended details and daily `AirAndPollen`/index information; availability varies by response type. |
| Visibility | Yes | Current Conditions extended details; hourly fields are endpoint/schema dependent. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Limited | Detailed daily forecast schema can include `AirAndPollen` entries for air quality, with value, category, category value, and pollutant type such as ozone or particle pollution. |
| AQ concentrations | No verified support in Core Weather | The documented `AirAndPollen` object is an index/category summary, not a six-pollutant concentration series. |
| AQ temporal granularity | Daily | One summarized list per daily forecast record. The separate Indices API can also retrieve daily index products. |
| AQI scale | Provider-defined | Preserve AccuWeather's value/category metadata; do not label it US EPA AQI unless product metadata explicitly says so. |
| Pollen | Yes | Daily `AirAndPollen` entries can include grass, mold, weed, and tree. |

## Adapter boundary

Classification: **not planned because there is no ongoing free tier**. The
technical boundary below is retained as research only.

If reconsidered, a weather adapter would need multiple calls to assemble
current, hourly, daily, and alerts. It should request extended daily details
when AQ/pollen summaries are included, or use the Indices API if plan/quota
behavior makes that preferable. Expose this as daily environmental indices,
not hourly pollutant concentrations, and cache coordinate-to-location-key
resolution separately.

## Sources

- [AccuWeather Core Weather API](https://developer.accuweather.com/apis)
- [Daily Forecast endpoints](https://developer.accuweather.com/core-weather/location-key-daily)
- [Core Weather schemas, including AirAndPollen](https://developer.accuweather.com/core-weather/~schemas)
- [AccuWeather API pricing](https://developer.accuweather.com/pricing)
- [AccuWeather FAQ: trial duration and request allowance](https://developer.accuweather.com/faq)
