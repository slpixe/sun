# MET Norway

Research checked: **2026-08-15**

## Application status

| Item | Actual integration |
| --- | --- |
| Adapter | Implemented and live-checked 2026-08-16 with the required identifying user agent. |
| Weather requests | Locationforecast Complete by latitude/longitude; elevation is supported when known. |
| Canonical output observed | First model point as near-now conditions, 24 variable-interval points, and 7 days derived from forecast steps. |
| Mapped extras | Precipitation, wind, and available clear-sky UV. Daily UV becomes absent as the upstream horizon loses that field. |
| Not mapped / unavailable | Sunrise uses another API, visibility distance is not supplied, and Norway-only AQ is not connected. |

## Product and location model

| Item | Details |
| --- | --- |
| Main weather API | Locationforecast 2.0 for automatic forecasts at coordinates. |
| Related APIs | Sunrise 3.0, MetAlerts 2.0, Nowcast, Frost observations, and Airqualityforecast 0.1 are separate products. |
| Location input | Latitude/longitude; altitude is optional and recommended for better temperature adjustment. |
| Weather spatial meaning | Model grid at the requested point. Nordic/Arctic short-range models are about 2.5 km; rest-of-world ECMWF data is about 9 km. |
| Forecast horizon | Approximately nine to ten days, with coarser time steps in the medium range. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Limited | Locationforecast is forecast/model data; its first instant can represent near-now conditions but is not a current-observation product. |
| Minutely | Separate / regional | Nowcast is a separate product for parts of the Nordic area. |
| Hourly | Yes | Short range normally uses one-hour steps; medium range uses coarser steps. |
| Daily | Limited | No simple daily array; adapters must derive display days from instants and 6/12-hour periods without inventing precision. |
| Alerts | Separate / regional | MetAlerts is a separate Norway-focused product. |
| History | Separate / limited | Current Locationforecast API serves forecasts only. Nordic/Arctic historical model files are available through THREDDS; observations use Frost. |
| Sunrise / sunset | Separate | Sunrise 3.0 is a global astronomical calculation API. |
| UV | Yes | Clear-sky UV is in the complete Locationforecast output, but not in long-range periods. |
| Visibility | No verified distance | Locationforecast has fog-area fraction, not a documented visibility-distance variable. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Separate / Norway only | Airqualityforecast 0.1, updated daily, returns hourly forecast intervals for Norwegian locations. |
| Spatial granularity | Administrative area or station | Coordinate requests require an `areaclass`: county, municipality, part of municipality, or basic statistical unit; a station ID is an alternative. |
| AQI | Yes | Provider-defined AQI class and descriptions. |
| Pollutants | Yes | NO2, O3, PM10, PM2.5, and SO2 concentrations. |
| Pollen | No verified support | Not part of Airqualityforecast. |
| Product stability | Limited | The official product documentation warns that availability/content may change without notice. |

## Adapter boundary

Classification: **separate upstream AQ API with regional coverage**.

The weather adapter can operate globally, but the AQ capability resolver must return unsupported outside Norway. Inside Norway, retain the selected administrative area or station as the AQ spatial provenance. Sunrise and alerts would each require additional optional calls too, so they should not be hidden inside a mandatory base-weather request.

## Implementation status

Locationforecast weather is implemented as provider `met-norway` using the `complete` GeoJSON endpoint. The adapter:

- maps the first model instant to canonical current forecast data;
- preserves each forecast step's interval and exposes the provider's one-hour-to-six-hour resolution change;
- derives seven display days from local-time forecast steps and labels the daily data as derived;
- honors upstream `Expires` and `Last-Modified` headers, including conditional `304` revalidation;
- requires `MET_NORWAY_USER_AGENT` with genuine application and contact information before the server registers the provider.

The separate Norway-only air-quality product is not connected yet, so the provider registry reports air quality as unavailable rather than silently using Open-Meteo AQ.

## Sources

- [Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/documentation)
- [Locationforecast data model and model domains](https://docs.api.met.no/doc/locationforecast/datamodel.html)
- [Airqualityforecast 0.1](https://api.met.no/weatherapi/airqualityforecast/0.1/documentation)
- [Sunrise 3.0](https://docs.api.met.no/doc/sunrise/celestial.html)
- [MET Weather API product list](https://api.met.no/)
