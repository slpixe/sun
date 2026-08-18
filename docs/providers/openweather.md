# OpenWeather

Research checked: **2026-08-15**

## Application status

| Item | Actual integration |
| --- | --- |
| Adapter | Implemented with a configured key and live-checked 2026-08-16. |
| Configured account access | Current Weather, 5 Day / 3 Hour Forecast, and current/forecast Air Pollution. One Call 3.0 is not enabled for this key. |
| Canonical output observed | Current observation, 8 three-hour points covering the next 24 hours, and 6 days derived from forecast steps. |
| Mapped extras | Precipitation, wind, hourly visibility, current-day sunrise/sunset, and an optional independently cached AQ resource. AQ maps the provider's 1–5 index plus PM2.5, PM10, CO, NO, NO₂, SO₂, O₃, and NH₃. |
| Not mapped / unavailable | One Call UV and full daily astronomy are unavailable on this account. AQ history is not requested. |

## Product and location model

| Item | Details |
| --- | --- |
| Main weather API | One Call API 3.0 for current, minutely, hourly, daily, and government alert data. |
| Standard APIs | Current Weather plus 5 Day / 3 Hour Forecast work without the separate One Call subscription. |
| Air-quality API | Separate Air Pollution API with current, forecast, and historical endpoints. |
| Location input | Latitude/longitude for One Call and Air Pollution. City/ZIP conversion uses the separate Geocoding API. |
| Spatial meaning | Forecast/model data for a requested coordinate. |
| Coverage | Global weather and air pollution. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | One Call `current`. |
| Minutely | Yes | Minute precipitation forecast where available. |
| Hourly | Yes | One Call hourly forecast. |
| Daily | Yes | One Call daily forecast. |
| Alerts | Yes | Government-issued alerts where available. |
| History | Yes | One Call historical/timemachine capabilities, subject to product access. |
| Sunrise / sunset | Yes | Current and daily fields. |
| UV | Yes | Current/hourly UV and daily maximum UV. |
| Visibility | Yes | Current/hourly visibility. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current AQ | Separate | `/data/2.5/air_pollution`. |
| AQ forecast | Separate | `/data/2.5/air_pollution/forecast`, four days at hourly granularity. |
| AQ history | Separate | `/data/2.5/air_pollution/history`; documented from 2020-11-27. |
| AQI scale | Yes | OpenWeather's own categorical index from 1 (Good) to 5 (Very Poor). It is not US EPA AQI. |
| Pollutants | Yes | CO, NO, NO2, O3, SO2, PM2.5, PM10, and NH3 in `µg/m³`. |
| Pollen | No verified support | Not in the Air Pollution API documentation. |

## Adapter boundary

Classification: **separate upstream AQ request**.

One Call and Air Pollution can be fetched concurrently for a weather+AQ bundle. Use separate cache entries and keep the provider's `openweather-1-5` AQI scale explicit. The AQ series ends after four days even when daily weather extends further.

## Application integration

The current adapter uses Current Weather and 5 Day / 3 Hour Forecast because the configured account does not include the separate One Call 3.0 subscription. It maps the native three-hour steps directly and derives daily summaries without claiming hourly precision. Sunrise and sunset are available for the current day; UV and alerts remain marked as not connected.

## Sources

- [One Call API 3.0](https://openweathermap.org/api/one-call-3)
- [Current Weather API](https://openweathermap.org/api/current)
- [5 Day / 3 Hour Forecast](https://openweathermap.org/api/forecast5)
- [Air Pollution API](https://openweathermap.org/api/air-pollution)
- [Weather API product list](https://openweathermap.org/api/weather-data)
