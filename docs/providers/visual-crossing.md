# Visual Crossing

Research checked: **2026-08-15**

## Application status

| Item | Actual integration |
| --- | --- |
| Adapter | Implemented with a configured key and live-checked 2026-08-17. |
| Weather requests | One metric Timeline request by latitude/longitude. |
| Canonical output observed | Current observation, 24 hourly points, and 7 native daily points. |
| Mapped extras | Daily sunrise/sunset, hourly and daily UV, hourly visibility, and precipitation probability. |
| AQ output observed | Current and hourly US EPA AQI, European 1–6 AQI, PM1, PM2.5, PM10, O3, NO2, SO2, and CO from the same Timeline response. |
| Not mapped | Daily AQ aggregates, alerts, and history. |

## Product and location model

| Item | Details |
| --- | --- |
| Main API | Timeline Weather API, which can return history, current conditions, hourly forecast, daily forecast, and alerts in one continuous result. |
| Location input | City/country, full or partial address, postal/ZIP code, latitude/longitude, and documented station identifiers. |
| Spatial meaning | Resolved location and weather values for the requested point/address; source metadata can identify observations, forecast, historical forecast, or statistical data. |
| Forecast horizon | Normally 15 days when no dates are supplied. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | `currentConditions`. |
| Minutely | Limited | Sub-hourly/minute intervals are documented as an optional Timeline capability. |
| Hourly | Yes | Included by default unless sections are reduced. |
| Daily | Yes | Included by default. |
| Alerts | Yes | Returned as a Timeline response section where supported. |
| History | Yes | Same Timeline endpoint with a requested date/range. |
| Sunrise / sunset | Yes | Daily fields. |
| UV | Yes | Hourly value and daily maximum; optional alternative `uvindex2` has a shorter forecast. |
| Visibility | Yes | Hourly/daily weather element. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Yes | Optional elements in the same Timeline request. Global, limited history, five-day forecast. |
| Temporal granularity | Yes | Hourly values and daily aggregates. |
| AQI scales | Yes | `aqius` (US EPA AQI) and `aqieur` (European AQI). |
| Pollutants | Yes | PM1, PM2.5, PM10, O3, NO2, SO2, and CO. |
| Pollen | No verified support | Not listed with the documented Timeline AQ elements. |

## Adapter boundary

Classification: **same upstream forecast request, optional elements**.

Add only the environmental elements needed by the bundle, for example `elements=+aqius` or an explicit pollutant list. Internally keep weather and AQ mapper outputs separate even though they originate in one response. The AQ section must end after its documented five-day horizon rather than inheriting the longer weather horizon.

The adapter now appends AQ elements only when the client includes air quality.
It maps `aqius` as numeric US EPA AQI and preserves the distinct 1–6 `aqieur`
scale as `visual-crossing-european-category`. All seven pollutant
concentrations remain in the provider's documented `µg/m³` unit, including
gases. PM1 was added to the shared pollutant schema and current AQ display.
Weather and AQ are cached independently after the single upstream request.

A live seven-day Lutsk request returned current and hourly AQ plus daily AQ
aggregates for the first five days; every AQ field was `null` on days six and
seven while weather remained present. The mapper treats null as missing rather
than zero and does not extend AQ beyond the provider's actual coverage.

## Sources

- [Timeline Weather API](https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/)
- [Weather data elements](https://www.visualcrossing.com/resources/documentation/weather-data/weather-data-documentation/)
- [Air-quality elements in the Timeline API](https://www.visualcrossing.com/resources/documentation/weather-api/air-quality-elements-in-the-weather-api/)
