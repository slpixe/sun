# Pirate Weather

Research checked: **2026-08-15**

## Application status

| Item | Actual integration |
| --- | --- |
| Adapter | Implemented with a configured key and live-checked 2026-08-17. |
| Weather requests | One Forecast v2 request by latitude/longitude using SI units; the key is sent in a header rather than embedded in the URL. |
| Canonical output observed | Current model estimate, 24 of the 48 returned hourly points, and 7 native daily points. |
| Mapped extras | Daily sunrise/sunset, hourly and daily UV, hourly visibility, precipitation probability, and wind. |
| AQ output observed | Current and 24 of 48 returned hourly EU CAQI points, plus PM2.5, PM10, O3, NO2, SO2, and CO. Weather and AQ are split into independently cached canonical resources. |
| Not mapped | Daily AQ min/max summaries, alerts, and history are not exposed in the application. |

## Product and location model

| Item | Details |
| --- | --- |
| Main API | Dark Sky-compatible `/forecast/{apiKey}/{location}` response. |
| Location input | Latitude/longitude; current documentation also supports city/country. |
| Spatial meaning | Requested point mapped to a hierarchy of regional/global model grids. Field sources can differ by region and availability. |
| History | Time Machine service with the same general response shape and different source rules. |

## Weather capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Current | Yes | `currently`. |
| Minutely | Yes | Sixty one-minute output records, but source/model precision can be coarser than one minute. |
| Hourly | Yes | 48 hours normally; 168 with `extend=hourly`. |
| Daily | Yes | Seven daily records plus a separate day/night block. |
| Alerts | Yes | Included where source alerts cover the location. |
| History | Separate | Time Machine host; recent model archives and older ERA5-based data. |
| Sunrise / sunset | Yes | Daily fields calculated with Astral. |
| UV | Yes | Current/hourly value and daily maximum/time. |
| Visibility | Yes | Current/hourly and daily average; capped at 16 km in metric-style units. |

## Environmental capabilities

| Capability | Availability | Granularity / notes |
| --- | --- | --- |
| Air quality | Yes | AQI appears in Forecast v2; `include=airqualitydetails` adds current/hourly concentrations. Daily min/max AQI summaries share the response. |
| AQI scale | Unit-dependent | `us`/default uses US EPA AQI, `ca` uses Canadian AQHI, and `si`/`uk` uses EU CAQI. |
| Pollutants | Yes | CO, NO2, O3, SO2 in `ppb`; PM2.5 and PM10 in `µg/m³`. |
| AQ sources | Domain-dependent | RAQDPS is preferred where covered; SILAM is the global fallback/source. |
| Pollen | No verified support | No pollen fields in the documented data point. |

## Adapter boundary

Classification: **same upstream forecast request**.

Request API version 2 and split the single response into weather and AQ resources. The mapper must derive the AQI scale from the requested unit group; a bare numeric `airQualityIndex` is unsafe. Preserve provider units for gases rather than silently converting `ppb` to mass concentration.

The adapter uses `units=si`, so `airQualityIndex` is mapped explicitly as EU
CAQI. It adds `include=airqualitydetails` only for client requests that include
AQ, then maps current and 24 hourly points from the same response used for
weather. PM2.5 and PM10 remain in `µg/m³`; O3, NO2, SO2, and CO remain in
`ppb`. A live Lutsk request returned all six concentrations and 48 upstream AQ
hours. Weather-only requests omit the include flag to reduce response size and
provider work.

## Sources

- [Pirate Weather API documentation](https://docs.pirateweather.net/en/latest/API/)
- [Forecast element data sources](https://docs.pirateweather.net/en/latest/DataSources/)
- [OpenAPI specification](https://docs.pirateweather.net/en/latest/Specification/)
