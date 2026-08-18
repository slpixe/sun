# Open-Meteo

Research checked: **2026-08-15**

## Application status

| Item | Actual integration |
| --- | --- |
| Adapter | Implemented and live-checked 2026-08-16; no API key required. |
| Weather requests | Forecast API by latitude/longitude, metric units, and requested IANA timezone. |
| Canonical output observed | Current model estimate, 24 hourly points, and 7 native daily points. |
| Mapped extras | Daily sunrise/sunset, hourly and daily UV, hourly visibility, and precipitation probability. |
| Environmental resources | AQ and pollen are independently cached optional resources. When both are missing, one Air Quality API request supplies both. |

## Product and location model

| Item | Details |
| --- | --- |
| Weather API | Forecast API at `/v1/forecast`. Historical Weather and other products use separate endpoints. |
| Air-quality API | Separate Air Quality API at `/v1/air-quality`. |
| Location input | Latitude and longitude. Name/postcode lookup is a separate Geocoding API. |
| Weather spatial meaning | Requested point represented by one or more forecast-model grid cells; model selection and resolution vary by location. |
| AQ spatial meaning | Model grid. CAMS European data is about 11 km; CAMS global data is about 45 km. |
| Coverage | Weather and AQ are global; European pollen fields are restricted to Europe and pollen season. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | `current` variables derived from the selected model data. |
| Minutely | Limited | Fifteen-minute weather variables are available in supported configurations/regions. |
| Hourly | Yes | Selectable variables and forecast horizon. |
| Daily | Yes | Selectable aggregates including min/max temperature. |
| Alerts | No verified support | Not part of the Forecast API response. |
| History | Separate | Historical Weather API and Historical Forecast API products. |
| Sunrise / sunset | Yes | Daily forecast variables. |
| UV | Yes | Hourly UV/clear-sky UV and daily maximum UV variables. |
| Visibility | Yes | Hourly visibility. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Separate | `current` and `hourly` sections in the Air Quality API. Default five forecast days; up to seven days can be requested. |
| AQI scales | Yes | European AQI and United States AQI. |
| Pollutants | Yes | PM10, PM2.5, CO, NO2, SO2, O3, and NH3; additional atmospheric fields include dust, aerosol optical depth, methane, and others. |
| Pollen | Limited | Alder, birch, grass, mugwort, olive, and ragweed; Europe only, during pollen season, with a shorter forecast horizon. |
| Model cadence | Domain-dependent | European CAMS is higher resolution and hourly; global CAMS is coarser and natively three-hourly. The API may interpolate output times. |

## Adapter boundary

Classification: **separate upstream environmental request**.

The adapter requests only the environmental fields selected by the client. When both AQ and pollen are selected, it combines them in one upstream request but caches the canonical resources independently because their useful TTLs and coverage differ. Missing seasonal pollen fields remain absent rather than becoming zero. Pollen retains CAMS Europe grid provenance and its approximate 11 km native resolution.

## Sources

- [Forecast API](https://open-meteo.com/en/docs)
- [Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- [Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
