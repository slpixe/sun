# Repository instructions

## Purpose and current product

This repository is a provider-neutral weather application. The implemented
client is a React/Vite PWA; there is no native mobile package yet. A Fastify API
keeps provider credentials server-side and maps every upstream response into
shared Zod-validated contracts.

Read `README.md` for setup and current production status. Read
`docs/architecture.md` and `docs/weather-model.md` before changing public data
flow or schemas. Read `docs/providers/README.md` plus the relevant provider
profile before changing an adapter or capability claim.

## Repository map

- `apps/web`: PWA UI, IndexedDB persistence, service worker, API client
- `apps/api`: Fastify routes, provider registration, orchestration, Vercel entrypoint
- `packages/weather-domain`: canonical weather/environment schemas
- `packages/contracts`: public API schemas
- `packages/provider-core`: provider interfaces, resource caching, Upstash store,
  and provider budgets
- `packages/provider-*`: one isolated upstream adapter per provider
- `docs/providers`: provider-owned research and observed configured-plan behavior

Use pnpm workspaces and Turborepo. Do not introduce a second package manager or
commit generated `dist`, coverage, local database, or environment files.

## Non-negotiable data rules

- Treat upstream JSON as `unknown`; validate it with provider-specific Zod
  schemas before mapping it.
- Provider response shapes must not leak into the browser or public contracts.
- Preserve the selected provider. Never silently fall back to another provider.
- Preserve whether values are observations, model estimates, grid cells, points,
  nearest sites, or regional data. Do not imply finer precision.
- Preserve current/hourly/daily granularity and real forecast horizons. Do not
  manufacture hourly values from daily data or vice versa.
- Canonical coordinates are WGS84. Instants are ISO 8601 UTC strings; locations
  separately carry an IANA timezone. Canonical measurements are metric.
- Missing/unavailable values stay absent, never zero or guessed.
- AQI values must retain their named scale. Pollutants retain explicit units;
  do not convert gas concentrations without a documented physical convention.
- Weather, air quality, and pollen remain independently optional resources with
  independent freshness and cache keys, even when one upstream request supplies
  multiple resources.
- Do not spend provider quota on AQ or pollen unless the client requests it.

## Provider and location context

Production currently exposes Open-Meteo, MET Norway, Visual Crossing,
OpenWeather, Pirate Weather, Tomorrow.io, Weatherbit, and UK Met Office.

- WeatherAPI.com's adapter remains in the repository, but production deliberately
  has no key because live comparisons returned implausible temperatures. Do not
  re-enable it without explicit user approval and a new reliability check.
- AccuWeather is excluded because it has no ongoing free tier.
- Weatherstack is excluded because its free tier cannot provide the forecast
  experience.
- Tomorrow.io AQ/pollen are disabled for the configured plan.
- Weatherbit has no hourly weather on the configured plan.
- Met Office data is nearest-site data and must expose that provenance.
- Open-Meteo currently supplies name/postcode search. Location lookup and
  weather-provider selection are separate concerns.

Do not add a fallback provider. Surface unavailable features and partial
environmental failures accurately.

## Persistence, caching, and quota safety

- Browser preferences, selected location/provider, and last responses live in
  IndexedDB. Static PWA assets use service-worker Cache Storage.
- There are no user accounts and no server-side user database.
- Production cache and atomic provider budgets use the London Upstash Redis
  database through Vercel's `KV_REST_API_*` variables.
- Local development falls back to process-local cache and budgets when Redis is
  absent.
- Cache entries use `fetchedAt`, `expiresAt`, and `staleAfter`; retain
  stale-if-error behavior and in-flight request coalescing.
- Budget only genuine cache-miss provider loads. Review upstream calls per
  canonical load before changing a provider's daily budget.
- Never bypass caching or budgets in a production request path merely to simplify
  an adapter.

## Secrets and security

- Never print, commit, upload, or expose API keys, Redis tokens, Vercel
  environment pulls, `.env`, or `.env.local`.
- Provider credentials belong only in `apps/api` runtime configuration. Never
  add them to `VITE_*`, browser code, responses, logs, or documentation.
- `VITE_API_BASE_URL` is the web app's public API origin and must never contain
  or be accompanied by provider credentials.
- The serverless entrypoint must not call dotenv/`loadEnvFile` or otherwise bundle
  the repository's local `.env`. Vercel supplies production environment values.
- MET Norway's user agent contains real contact identity; treat it as a secret
  operational value even though the upstream API sends it as identification.
- Do not rotate/delete credentials, databases, deployments, or other production
  resources without explicit user approval. Resolve exact targets first.

## UI expectations

- The app remains usable on mobile and desktop and retains accessible labels,
  keyboard focus states, and semantic roles.
- The provider chooser is the source of truth for comparing configured provider
  features.
- Show attribution for the selected weather provider beneath forecast data.
  Do not restore the removed geocoding attribution footer on the empty search
  screen unless legal/provider requirements change.
- Only show fields the canonical response actually contains. Make temporal and
  spatial provenance visible where it affects interpretation.
- Wind is displayed as km/h; its arrow points toward the direction the wind is
  travelling.

## Commands and verification

Use Node.js 24+ and pnpm 11.9.0.

```sh
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

For focused changes, run the relevant workspace tests/typecheck/build first,
then the repository-level checks in proportion to the change. Provider adapters
need mapper/schema unit tests. API orchestration changes need `@weather/api`
tests. UI behavior changes should be inspected in the running PWA, including a
mobile-sized layout when responsive behavior changes.

Do not claim a provider or deployment works from compilation alone. For provider
work, verify representative real responses without logging credentials. For a
production deployment, verify custom-domain health and the intended feature.

## Documentation and git

- Update `README.md` when setup, provider enablement, production topology, or
  user-visible capability changes.
- Update `docs/architecture.md` or `docs/weather-model.md` when changing their
  decisions or invariants.
- Update the provider matrix and individual profile after live plan/field
  findings; distinguish upstream capability, configured account access, adapter
  support, and production enablement.
- Preserve unrelated user changes. Keep commits focused and do not rewrite
  history. Commit completed, verified work with a concise message unless the
  user asks not to.

## Production topology and operations

- Web: Vercel project `sun`, root `apps/web`, `https://sun.slpixe.com`
- API: Vercel project `sun-api`, root `apps/api`,
  `https://sun-api.slpixe.com`, runtime region `lhr1`
- Redis: free Upstash Redis connected to `sun-api` Production in London
- DNS source of truth: `~/web/me/domains`

Production deployment is an external mutation: deploy only when the user asks.
DNS changes must go through the domains repository's Terraform/GitLab workflow;
do not edit records directly in Cloudflare. Keep the web and API as separate
Vercel projects. After API deployment, check `/health`, `/v1/providers`, at
least one representative weather request, and an origin-level Redis cache hit.
A Vercel CDN hit can replay an earlier `x-*-cache: miss`; add a unique harmless
query parameter when the check must reach the origin.
