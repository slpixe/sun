# Weatherbit

Research checked: **2026-08-17**

## Application status

| Item | Actual integration |
| --- | --- |
| Adapter | Implemented with a configured key and live-checked 2026-08-17. |
| Configured account access | Current Weather and Daily Forecast succeed. Hourly Weather, Current AQ (which carries pollen), and Forecast AQ endpoints return `403` (“key does not allow access to this endpoint”). |
| Canonical output observed | Current observation and 7 native daily points; hourly is explicitly unavailable rather than approximated from daily data. |
| Mapped extras | Daily sunrise/sunset and daily UV, plus current humidity and wind. |
| AQ output observed | Current Weather includes one numeric US EPA AQI, now exposed as a current-only canonical AQ resource with no pollutants or hourly series. |
| Pollen access observed | Current Weather returns no pollen fields. The separate Current Air Quality endpoint returns `403`, so pollen stays disabled rather than triggering a rejected request. |
| Not mapped / unavailable | Current visibility has no canonical current field yet. Hourly precipitation/UV/visibility, full AQ pollutants/forecast, pollen, alerts, and history are not connected. |

## Product and location model

| Item | Details |
| --- | --- |
| Weather APIs | Separate Current, Daily Forecast, Hourly Forecast, Minutely Forecast, Alerts, and Historical endpoint families. |
| Air-quality APIs | Separate Current, Forecast, and Historical Air Quality endpoints; documented as Business/Enterprise products. |
| Location input | Latitude/longitude, city, postal code, airport ICAO code, and selected endpoint-specific station identifiers. |
| Spatial meaning | Requested point or nearest representative source blend; forecast resolution is generally about 1–13 km by region/product. |
| Coverage | Global weather and core AQ; pollen has regional restrictions. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | Current Weather API. Its response also includes a single US EPA AQI value. |
| Minutely | Yes | Separate 60-minute minutely forecast. |
| Hourly | Yes | Up to 240 hours. |
| Daily | Yes | Up to 16 days. |
| Alerts | Separate | Severe Weather Alerts API. |
| History | Separate / tier-dependent | Daily, hourly, and 15-minute Historical Weather APIs. |
| Sunrise / sunset | Yes | Current and daily fields. |
| UV | Yes | Current, hourly, and daily. |
| Visibility | Yes | Current/hourly weather fields. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| AQ summary in weather | Limited | Current Weather includes `aqi` only, using US EPA AQI. It does not replace the full AQ product. |
| Current AQ | Separate / tier-dependent | Current Air Quality API with pollutants and AQI. |
| AQ forecast | Separate / tier-dependent | Hourly, 72-hour global forecast. |
| AQ history | Separate / tier-dependent | Hourly historical AQ. |
| Pollutants | Yes | PM2.5, PM10, CO, SO2, NO2, and O3; core documentation describes six pollutant streams. |
| Pollen | Limited | The Current Air Quality response can include tree/grass/weed and mold levels from 0–4 plus the predominant pollen type in supported US/EU locations. These are current categories, not grain concentrations or a 72-hour pollen forecast. |

## Adapter boundary

Classification: **separate upstream AQ APIs**, with one AQI shortcut in Current Weather.

Use the dedicated AQ endpoints for a complete canonical AQ resource. The
adapter now exposes the current weather response's `aqi` as a deliberately
limited current-only resource: `us-epa` scale, an empty pollutant set, and no
hourly series. It shares the existing current + daily weather fetch and is
cached independently without adding another Weatherbit call.

The configured key returned a live current AQI of 50, while both
`current/airquality` and `forecast/airquality` returned `403`. Do not combine
the lone summary value with missing pollutant fields as if it were the full AQ
product. If the account is upgraded later, the dedicated endpoints can replace
this summary with six pollutant concentrations and a 72-hour hourly forecast.

Pollen has the same upstream and account boundary as Current Air Quality. A
live Lutsk request on 2026-08-17 confirmed that the normal Current Weather
response contains no pollen fields and `current/airquality` returns `403` on
the configured key. The adapter therefore advertises pollen as limited but not
integrated. If access is upgraded, map Weatherbit's 0–4 tree/grass/weed levels
as provider indices rather than labelling them as `grains/m³`; mold and the
predominant type should also remain explicit categorical fields.

## Sources

- [Weatherbit API documentation](https://www.weatherbit.io/api)
- [Weather Forecast API overview](https://www.weatherbit.io/api/weather-forecast-api)
- [Current Weather API](https://www.weatherbit.io/api/weather-current)
- [Air Quality API overview](https://www.weatherbit.io/api/air-quality-api)
- [Current Air Quality API](https://www.weatherbit.io/api/airquality-current)
- [Air Quality Forecast API](https://www.weatherbit.io/api/airquality-forecast)
- [Historical Weather API](https://www.weatherbit.io/api/historical-weather-api)
