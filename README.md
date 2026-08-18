# Weather

A provider-neutral weather application built as a React/Vite progressive web
app with a Fastify API. Users select a canonical location, choose an available
weather provider, and receive normalized current, hourly, daily, air-quality,
and pollen data according to that provider's real capabilities.

## Live application

- Web PWA: [sun.slpixe.com](https://sun.slpixe.com)
- API health: [sun-api.slpixe.com/health](https://sun-api.slpixe.com/health)
- Provider registry: [sun-api.slpixe.com/v1/providers](https://sun-api.slpixe.com/v1/providers)

The web and API are separate Vercel projects named `sun` and `sun-api`. The API
function and shared Upstash Redis database run in London (`lhr1`). DNS for both
subdomains is managed as code in `~/web/me/domains`, not directly in the
Cloudflare dashboard.

## What is implemented

- Installable responsive PWA with a service worker.
- Debounced place/postcode search with populated places ranked ahead of airports.
- Browser geolocation and one-click suggested locations.
- Full-screen provider comparison based on configured adapter capabilities.
- Current conditions, hourly outlook, and seven-day forecast.
- Sunrise/sunset, UV, visibility, precipitation probability, wind, AQ, and
  pollen when the selected provider supplies them.
- Selected location, provider, and last forecast persisted in IndexedDB for
  quick/offline display. There are no user accounts or server-side user database.
- Server-side provider adapters, shared cache, stale-if-error behavior, and
  per-provider daily load budgets.
- Explicit attribution for the selected weather provider beneath forecast data.

Location search currently uses Open-Meteo's geocoding service. Weather-provider
selection is independent: choosing a location never locks the user to
Open-Meteo weather.

## Workspace

- `apps/web` — React/Vite website and installable PWA
- `apps/api` — Fastify HTTP API and provider orchestration
- `packages/weather-domain` — canonical browser-safe weather schemas
- `packages/contracts` — public API request/response schemas
- `packages/provider-core` — server-only provider, cache, and budget interfaces
- `packages/provider-*` — isolated upstream adapters and validation/mapping
- `docs` — [architecture](docs/architecture.md), [weather model](docs/weather-model.md),
  and [provider capability research](docs/providers/README.md)

There is currently no native/mobile application package.

## Requirements and commands

- Node.js 24 or newer
- pnpm 11.9.0 (declared in `package.json`)

```sh
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

The default local URLs are `http://localhost:3000` for the PWA and
`http://localhost:3001` for the API.

Run the repository checks with:

```sh
pnpm test
pnpm typecheck
pnpm build
```

Develop the web UI in isolation with Storybook. Its stories use validated mock
contract data and cover individual controls, forecast blocks, the combined
forecast, and complete page states.

```sh
pnpm storybook
pnpm build:storybook
```

## Provider status

Open-Meteo is always registered. Other adapters appear only when their
server-side environment value is configured.

| Provider | Production | Important configured limitation |
| --- | --- | --- |
| Open-Meteo | Enabled, keyless | AQ and European seasonal pollen come from its separate Air Quality API. |
| MET Norway | Enabled | Variable forecast intervals; daily output is derived. |
| Visual Crossing | Enabled | AQ shares the Timeline request and has a shorter horizon than weather. |
| OpenWeather | Enabled | Standard Current, 5 Day / 3 Hour, and Air Pollution APIs; no One Call 3.0 UV access. |
| Pirate Weather | Enabled | AQ details share Forecast v2 and are requested only when needed. |
| Tomorrow.io | Enabled | Configured plan does not expose AQ or pollen fields, so those capabilities are disabled. |
| Weatherbit | Enabled | Current + Daily only; no hourly weather. AQ is a current US EPA summary. |
| UK Met Office | Enabled | Global Spot is nearest-site forecast data; AQ and pollen are separate commercial products. |
| WeatherAPI.com | Disabled in production | Adapter exists, but live comparisons returned implausible temperatures; do not re-enable without a new reliability investigation. |
| Weatherstack | Excluded | Free tier is current-only and limited to 100 calls/month. |
| AccuWeather | Excluded | No ongoing free API tier. |

See the [application integration matrix](docs/providers/README.md#application-integration-matrix)
for observed output and the individual provider profiles for upstream product
boundaries. Pricing, quotas, and fields can change and must be verified against
provider-owned documentation before an adapter or plan assumption changes.

Provider credentials remain in the Fastify API. They must never be exposed to,
imported by, or prefixed for the web application.

## Environment configuration

Copy `.env.example` for local development. Optional provider variables are:

- `MET_NORWAY_USER_AGENT`
- `VISUAL_CROSSING_API_KEY`
- `OPENWEATHER_API_KEY`
- `WEATHERAPI_API_KEY` (adapter testing only; intentionally absent in production)
- `PIRATE_WEATHER_API_KEY`
- `TOMORROW_IO_API_KEY`
- `TOMORROW_IO_AIR_QUALITY_ENABLED`
- `WEATHERBIT_API_KEY`
- `MET_OFFICE_API_KEY`

The web app reads its public API origin from `VITE_API_BASE_URL`; the local
example lives at `apps/web/.env.example`. This is a public URL only—never place a
provider credential in a `VITE_*` variable.

Shared serverless state accepts either the direct Upstash pair
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or Vercel's native
`KV_REST_API_URL` / `KV_REST_API_TOKEN` pair. Without either complete pair,
cache and budget state are process-local.

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins that
may read API responses. Local development allows all origins when it is absent;
Vercel production refuses to start without an explicit value. Production uses
`https://sun.slpixe.com`. CORS is browser enforcement, not authentication or a
substitute for rate limiting.

`UPSTREAM_REQUEST_TIMEOUT_MS` bounds provider and location-search HTTP calls and
defaults to 10 seconds. Existing shorter adapter-specific timeouts still take
precedence.

`PROVIDER_DAILY_LOAD_BUDGETS` is a JSON object of positive integers. A budget is
consumed only when a cache miss or expired entry starts an upstream provider
load. Cache hits and stale fallback do not consume it.

Never commit `.env`, `.env.local`, Vercel environment pulls, API keys, Redis
credentials, or user-agent contact details. The serverless entrypoint must not
load or bundle the repository's local `.env` file.

## API

```text
GET /health
GET /v1/providers
GET /v1/locations/search?q=London
GET /v1/weather?provider=open-meteo&lat=51.5&lon=-0.12&timezone=Europe/London
GET /v1/weather?...&include=airQuality,pollen
```

Weather, air quality, and pollen are independently optional and cached
resources even when one upstream request supplies several of them. Responses
expose `x-weather-cache`, `x-air-quality-cache`, and `x-pollen-cache` as `hit`,
`miss`, or `stale` where applicable.

The public schema uses WGS84 coordinates, ISO 8601 UTC instants plus an IANA
location timezone, and canonical metric measurements. Missing values remain
absent; they are never invented or represented as zero. Provider-specific
temporal/spatial precision and named AQI scales must be preserved.

## Production operations

- Deploy the web from Vercel project `sun` (`apps/web`).
- Deploy the API from Vercel project `sun-api` (`apps/api`).
- `apps/api/vercel.json` keeps the API runtime in London (`lhr1`).
- Production Redis is the free London Upstash database connected to `sun-api`.
- Production provider secrets and budgets are Vercel environment variables.
- Production API CORS permits `https://sun.slpixe.com`; upstream calls have a
  bounded timeout.
- Manage `sun.slpixe.com` and `sun-api.slpixe.com` DNS only through
  `~/web/me/domains` and its normal Terraform/GitLab workflow.

Before declaring a deployment complete, check both custom domains, the provider
registry, representative provider responses, and an origin-level Redis cache
hit. A Vercel CDN hit can replay the original `x-*-cache: miss` header, so use a
unique harmless query parameter when verifying the origin cache.

See [AGENTS.md](AGENTS.md) for repository-wide instructions supplied to coding
agents.
