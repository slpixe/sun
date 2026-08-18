# Tomorrow.io

Research checked: **2026-08-17**

## Application status

| Item | Actual integration |
| --- | --- |
| Adapter | Implemented with a configured key and live-checked 2026-08-16. |
| Weather requests | One metric convenience Forecast request by latitude/longitude. |
| Canonical output observed | First minutely interval as near-now conditions, 24 hourly points, and 6 daily records (current day plus five forecast days). |
| Mapped extras | Daily sunrise/sunset, hourly and daily UV, hourly visibility, precipitation probability, and wind. |
| AQ adapter | Implemented as one advanced Timeline request that fans out into separately cached weather and AQ resources. It maps current/hourly US EPA AQI and six pollutants while preserving each upstream unit. |
| Configured access | AQ and pollen remain disabled. For both resources, the configured plan returns `403` when only restricted fields are requested and silently omits them from mixed weather/environment requests. |
| Not mapped | Pollen cannot be connected on the configured plan. Alerts and history are also not connected. |

## Product and location model

| Item | Details |
| --- | --- |
| Main flexible API | Weather Timelines, where callers select data-layer fields, time steps, and time range. |
| Convenience API | Weather Forecast endpoint for common minute/hour/day output. |
| Location input | Timeline Basic uses latitude/longitude. Advanced supports GeoJSON Point, LineString, or Polygon. The convenience Forecast endpoint also supports city, US ZIP, and UK postcode. |
| Spatial meaning | Point value, or min/max/average aggregation for a polygon/polyline. |
| Coverage | Core weather and the documented main AQ/pollen fields are worldwide, with field-specific exceptions. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | `current` timestep/Realtime API behavior. |
| Minutely | Tier-dependent | Up to one-minute time steps and a next-hour minute forecast in applicable plans. |
| Hourly | Yes | Convenience endpoint gives 120 hours; Timeline horizons depend on field and plan. |
| Daily | Yes | Convenience endpoint gives five days; premium Timelines can extend further. |
| Alerts | Separate | Alerts, Insights, Events, and webhooks are separate resources; severe events can represent authority-issued hazards. |
| History | Separate / tier-dependent | Recent History and Historical API products; field availability and token use vary. |
| Sunrise / sunset | Yes | Core data-layer fields. |
| UV | Yes | Core data layer, with a shorter field-specific horizon (documented to +108 hours). |
| Visibility | Yes | Core data layer. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Yes | AQ fields can be selected in the same Timeline request as weather fields. |
| Temporal availability | Field-specific | AQ fields document recent history to seven days and forecasts to roughly 100 hours. They can be requested on supported Timeline steps. |
| AQI scales | Yes | US EPA and China MEP indices, primary pollutant, and health concern. |
| Pollutants | Yes | PM2.5 and PM10 in mass concentration; O3, NO2, CO, and SO2 in `ppb`/`ppm` units. |
| Other AQ | Yes | Wildfire Smoke Index has a separate, shorter 48-hour horizon. |
| Pollen | Yes | Overall tree, grass, and weed 0–5 indices are worldwide; some species-specific indices are US-only. Forecast roughly +108 hours. |

## Adapter boundary

Classification: **same generic Timeline request, selected fields**.

One upstream Timeline call can carry weather, AQ, and pollen, but field horizons differ. Split it into independent canonical resources and use each field's actual last valid interval. For polygons or routes, preserve the spatial aggregation suffix (`Min`, `Max`, or `Avg`) rather than representing it as a point forecast.

The adapter now implements this split for point weather and AQ. Weather-only
requests retain the lower-cost convenience Forecast call. When AQ access is
explicitly enabled, the adapter instead selects weather, `epaIndex`,
`epaHealthConcern`, PM2.5, PM10, O3, NO2, CO, and SO2 in one Timeline request;
the API shares that request across the independent weather and AQ cache misses.
Particulate matter remains in `µg/m³`, O3/NO2/SO2 remain in `ppb`, and CO
remains in `ppm`.

`TOMORROW_IO_AIR_QUALITY_ENABLED` defaults to false. The configured key was
live-checked on 2026-08-16: AQ-only Timeline calls returned `403` with an
all-fields-not-allowed plan error, while mixed calls returned weather and
silently omitted every AQ field. Enable the flag only after changing to a plan
that exposes those fields; this keeps the provider chooser truthful and avoids
spending quota on unusable requests.

Pollen access was separately live-checked on 2026-08-17. A Timeline request for
`treeIndex`, `grassIndex`, and `weedIndex` returned the same `403003` “all
requested fields are not allowed” plan error. Adding those fields to an allowed
weather request succeeded but omitted every pollen field. The provider registry
therefore keeps pollen unavailable in this app; zero concentrations or indices
must not be inferred from the omitted fields.

## Sources

- [Weather Timelines overview](https://docs.tomorrow.io/reference/timeline-overview)
- [Weather data layers and timestep limits](https://docs.tomorrow.io/reference/weather-data-layers)
- [Core weather layer](https://docs.tomorrow.io/reference/data-layers-core)
- [Air Quality layer](https://docs.tomorrow.io/reference/data-layers-air)
- [Pollen layer](https://docs.tomorrow.io/reference/data-layers-pollen)
- [Historical API](https://docs.tomorrow.io/reference/historical-overview)
