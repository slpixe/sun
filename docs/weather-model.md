# Weather model

## Conventions

- Coordinates use WGS84.
- Timestamps use ISO 8601 UTC strings.
- Resolved locations carry a separate IANA timezone.
- Canonical measurements use metric units.
- Observation time, forecast generation time, valid time, and retrieval time remain distinct.
- Missing measurements remain missing; they are never represented as zero.
- Every response identifies its selected provider.
- Every air-quality index carries its named scale.
- Pollutant concentrations carry explicit units; gas concentrations are not converted without a documented physical convention.
- Weather, air quality, and pollen keep independent temporal coverage, spatial provenance, and freshness metadata.

## Boundaries

Provider payloads are parsed into provider-specific validated values, mapped into the canonical domain, and then presented through the public API contract. Provider response shapes must not leak directly into client code.

```text
unknown provider JSON
  -> provider Zod schema
  -> provider mapper
  -> canonical resource schema (weather / air quality / pollen)
  -> public bundle response schema
  -> versioned IndexedDB record
```
