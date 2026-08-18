/** Creates the provider-neutral Fastify application used by local and serverless entrypoints. */
import cors from "@fastify/cors";
import {
  LocationSearchQuerySchema,
  LocationSearchResponseSchema,
  ProvidersResponseSchema,
  WeatherQuerySchema,
  WeatherResponseSchema,
  type AirQualityResource,
  type PollenResource,
  type WeatherResponse,
} from "@weather/contracts";
import type {
  AirQualityProvider,
  AirQualityPollenBundle,
  LocationSearchProvider,
  PollenProvider,
  ProviderLoadBudget,
  WeatherAirQualityBundle,
  WeatherAirQualityPollenBundle,
  WeatherCache,
  WeatherPollenBundle,
  WeatherProvider,
} from "@weather/provider-core";
import {
  InMemoryProviderLoadBudget,
  ProviderBudgetExceededError,
  ProviderResourceCache,
  resourceCacheKey,
} from "@weather/provider-core";
import {
  OpenMeteoAirQualityProvider,
  OpenMeteoLocationSearchProvider,
  OpenMeteoWeatherProvider,
} from "@weather/provider-open-meteo";
import Fastify from "fastify";

export interface AppOptions {
  locationSearchProvider?: LocationSearchProvider;
  weatherProviders?: readonly WeatherProvider[];
  weatherProvider?: WeatherProvider;
  airQualityProviders?: readonly AirQualityProvider[];
  airQualityProvider?: AirQualityProvider | null;
  pollenProviders?: readonly PollenProvider[];
  pollenProvider?: PollenProvider | null;
  weatherCache?: WeatherCache;
  providerLoadBudget?: ProviderLoadBudget;
  providerDailyLoadBudgets?: Readonly<Record<string, number>>;
  corsAllowedOrigins?: readonly string[];
  now?: () => Date;
  logger?: boolean;
}

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const locationSearchProvider: LocationSearchProvider =
    options.locationSearchProvider ?? new OpenMeteoLocationSearchProvider();
  const weatherProviders: readonly WeatherProvider[] =
    options.weatherProviders ??
    [options.weatherProvider ?? new OpenMeteoWeatherProvider()];
  const defaultEnvironmentProvider = new OpenMeteoAirQualityProvider();
  const useDefaultProviders =
    options.weatherProvider === undefined && options.weatherProviders === undefined;
  const airQualityProviders: readonly AirQualityProvider[] =
    options.airQualityProviders ??
    (options.airQualityProvider === null
      ? []
      : options.airQualityProvider === undefined
        ? useDefaultProviders
          ? [defaultEnvironmentProvider]
          : []
        : [options.airQualityProvider]);
  const pollenProviders: readonly PollenProvider[] =
    options.pollenProviders ??
    (options.pollenProvider === null
      ? []
      : options.pollenProvider === undefined
        ? useDefaultProviders
          ? [defaultEnvironmentProvider]
          : []
        : [options.pollenProvider]);
  const weatherProvidersById = new Map<string, WeatherProvider>(
    weatherProviders.map((provider) => [provider.descriptor.id, provider] as const),
  );
  const airQualityProvidersById = new Map<string, AirQualityProvider>(
    airQualityProviders.map((provider) => [provider.providerId, provider] as const),
  );
  const pollenProvidersById = new Map<string, PollenProvider>(
    pollenProviders.map((provider) => [provider.providerId, provider] as const),
  );
  if (
    weatherProviders.length === 0 ||
    weatherProvidersById.size !== weatherProviders.length ||
    airQualityProvidersById.size !== airQualityProviders.length ||
    pollenProvidersById.size !== pollenProviders.length
  ) {
    throw new Error("Provider IDs must be present and unique");
  }
  const providerCache = new ProviderResourceCache({
    ...(options.weatherCache === undefined
      ? {}
      : { cache: options.weatherCache }),
    ...(options.now === undefined ? {} : { now: options.now }),
    onCacheError(error, context) {
      app.log.warn({ error, ...context }, "Provider cache failed");
    },
  });
  const providerLoadBudget =
    options.providerLoadBudget ??
    new InMemoryProviderLoadBudget({
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  const providerDailyLoadBudgets = options.providerDailyLoadBudgets ?? {};
  for (const [providerId, limit] of Object.entries(providerDailyLoadBudgets)) {
    if (providerId.trim().length === 0 || !Number.isInteger(limit) || limit < 1) {
      throw new Error("Provider daily load budgets must be positive integers");
    }
  }

  const loadProvider = async <T>(providerId: string, load: () => Promise<T>) => {
    const limit = providerDailyLoadBudgets[providerId];
    if (limit !== undefined) {
      await providerLoadBudget.consume(providerId, limit);
    }
    return load();
  };

  void app.register(cors, {
    origin:
      options.corsAllowedOrigins === undefined
        ? true
        : [...options.corsAllowedOrigins],
    exposedHeaders: ["x-weather-cache", "x-air-quality-cache", "x-pollen-cache"],
  });

  app.get("/health", async () => ({ status: "ok" as const }));

  app.get("/v1/providers", async () =>
    ProvidersResponseSchema.parse(
      weatherProviders.map((provider) => provider.descriptor),
    ),
  );

  app.get("/v1/weather", async (request, reply) => {
    const query = WeatherQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: "invalid_weather_request",
        message: "Provide a valid provider, latitude, and longitude.",
      });
    }
    const weatherProvider = weatherProvidersById.get(query.data.provider);
    if (weatherProvider === undefined) {
      return reply.status(400).send({
        error: "unsupported_provider",
        message: `Provider ${query.data.provider} is not available.`,
      });
    }

    const location = {
      id: `coordinates:${query.data.lat},${query.data.lon}`,
      displayName: "Forecast location",
      kind: "coordinates" as const,
      coordinates: {
        latitude: query.data.lat,
        longitude: query.data.lon,
        ...(query.data.elevation === undefined
          ? {}
          : { elevationMetres: query.data.elevation }),
      },
      timezone: query.data.timezone,
    };
    const includeAirQuality = query.data.include.includes("airQuality");
    const includePollen = query.data.include.includes("pollen");
    const airQualityProvider = airQualityProvidersById.get(query.data.provider);
    const pollenProvider = pollenProvidersById.get(query.data.provider);
    const combinedProviderMethod =
      weatherProvider.getWeatherAndAirQuality?.bind(weatherProvider);
    const combinedWeatherPollenMethod =
      weatherProvider.getWeatherAndPollen?.bind(weatherProvider);
    const combinedWeatherEnvironmentMethod =
      weatherProvider.getWeatherAirQualityAndPollen?.bind(weatherProvider);
    const useCombinedWeatherEnvironment =
      includeAirQuality &&
      includePollen &&
      airQualityProvider === undefined &&
      pollenProvider === undefined &&
      weatherProvider.descriptor.capabilities.airQuality &&
      weatherProvider.descriptor.capabilities.pollen &&
      combinedWeatherEnvironmentMethod !== undefined;
    const useCombinedProvider =
      includeAirQuality &&
      !useCombinedWeatherEnvironment &&
      airQualityProvider === undefined &&
      weatherProvider.descriptor.capabilities.airQuality &&
      combinedProviderMethod !== undefined;
    const useCombinedWeatherPollen =
      includePollen &&
      !useCombinedWeatherEnvironment &&
      pollenProvider === undefined &&
      weatherProvider.descriptor.capabilities.pollen &&
      combinedWeatherPollenMethod !== undefined;
    let combinedProviderPromise: Promise<WeatherAirQualityBundle> | undefined;
    const getCombinedResources = () => {
      if (combinedProviderMethod === undefined) {
        throw new Error("Combined weather and air-quality provider is unavailable");
      }
      if (combinedProviderPromise === undefined) {
        combinedProviderPromise = loadProvider(
          weatherProvider.descriptor.id,
          () =>
            combinedProviderMethod(location, {
              sections: ["current", "hourly", "daily"],
            }),
        );
      }
      return combinedProviderPromise;
    };
    let combinedWeatherPollenPromise: Promise<WeatherPollenBundle> | undefined;
    const getCombinedWeatherPollen = () => {
      if (combinedWeatherPollenMethod === undefined) {
        throw new Error("Combined weather and pollen provider is unavailable");
      }
      combinedWeatherPollenPromise ??= loadProvider(
        weatherProvider.descriptor.id,
        () =>
          combinedWeatherPollenMethod(location, {
            sections: ["current", "hourly", "daily"],
          }),
      );
      return combinedWeatherPollenPromise;
    };
    let combinedWeatherEnvironmentPromise:
      | Promise<WeatherAirQualityPollenBundle>
      | undefined;
    const getCombinedWeatherEnvironment = () => {
      if (combinedWeatherEnvironmentMethod === undefined) {
        throw new Error(
          "Combined weather, air-quality, and pollen provider is unavailable",
        );
      }
      combinedWeatherEnvironmentPromise ??= loadProvider(
        weatherProvider.descriptor.id,
        () =>
          combinedWeatherEnvironmentMethod(location, {
            sections: ["current", "hourly", "daily"],
          }),
      );
      return combinedWeatherEnvironmentPromise;
    };
    const combinedEnvironmentProvider =
      airQualityProvider !== undefined &&
      pollenProvider !== undefined &&
      Object.is(airQualityProvider, pollenProvider)
        ? (airQualityProvider as AirQualityProvider & PollenProvider)
        : undefined;
    const combinedEnvironmentMethod =
      combinedEnvironmentProvider?.getAirQualityAndPollen?.bind(
        combinedEnvironmentProvider,
      );
    let combinedEnvironmentPromise:
      | Promise<AirQualityPollenBundle>
      | undefined;
    const getCombinedEnvironment = () => {
      if (combinedEnvironmentMethod === undefined) {
        throw new Error("Combined air-quality and pollen provider is unavailable");
      }
      combinedEnvironmentPromise ??= loadProvider(
        combinedEnvironmentProvider?.providerId ?? weatherProvider.descriptor.id,
        () => combinedEnvironmentMethod(location),
      );
      return combinedEnvironmentPromise;
    };
    const useCombinedEnvironment =
      includeAirQuality && includePollen && combinedEnvironmentMethod !== undefined;
    const cacheCoordinates = {
      providerId: weatherProvider.descriptor.id,
      latitude: location.coordinates.latitude,
      longitude: location.coordinates.longitude,
    };

    try {
      const weatherPromise = providerCache.getOrLoad<WeatherResponse>(
        resourceCacheKey({
          resource: "weather",
          ...cacheCoordinates,
          ...(location.coordinates.elevationMetres === undefined
            ? {}
            : { elevationMetres: location.coordinates.elevationMetres }),
          timezone: location.timezone,
        }),
        (previous) =>
          useCombinedWeatherEnvironment
            ? getCombinedWeatherEnvironment().then((bundle) => bundle.weather)
            : useCombinedProvider
              ? getCombinedResources().then((bundle) => bundle.weather)
              : useCombinedWeatherPollen
                ? getCombinedWeatherPollen().then((bundle) => bundle.weather)
                : loadProvider(weatherProvider.descriptor.id, () =>
                    weatherProvider.getWeather(location, {
                      sections: ["current", "hourly", "daily"],
                      ...(previous === undefined ? {} : { previous }),
                    }),
                  ),
        (weather) => weather.metadata,
      );
      const airQualityPromise =
        includeAirQuality &&
        (airQualityProvider !== undefined ||
          useCombinedProvider ||
          useCombinedWeatherEnvironment)
          ? providerCache.getOrLoad<AirQualityResource>(
              resourceCacheKey({
                resource: "airQuality",
                ...cacheCoordinates,
              }),
              () =>
                useCombinedEnvironment
                  ? getCombinedEnvironment().then((bundle) => bundle.airQuality)
                  : useCombinedWeatherEnvironment
                    ? getCombinedWeatherEnvironment().then(
                        (bundle) => bundle.airQuality,
                      )
                    : airQualityProvider === undefined
                      ? getCombinedResources().then(
                          (bundle) => bundle.airQuality,
                        )
                      : loadProvider(airQualityProvider.providerId, () =>
                          airQualityProvider.getAirQuality(location),
                        ),
              (airQuality) => airQuality.metadata,
            )
          : undefined;
      const pollenPromise =
        includePollen &&
        (pollenProvider !== undefined ||
          useCombinedWeatherPollen ||
          useCombinedWeatherEnvironment)
          ? providerCache.getOrLoad<PollenResource>(
              resourceCacheKey({ resource: "pollen", ...cacheCoordinates }),
              () =>
                useCombinedEnvironment
                  ? getCombinedEnvironment().then((bundle) => bundle.pollen)
                  : useCombinedWeatherEnvironment
                    ? getCombinedWeatherEnvironment().then(
                        (bundle) => bundle.pollen,
                      )
                    : pollenProvider === undefined
                      ? getCombinedWeatherPollen().then(
                          (bundle) => bundle.pollen,
                        )
                      : loadProvider(pollenProvider.providerId, () =>
                          pollenProvider.getPollen(location),
                        ),
              (pollen) => pollen.metadata,
            )
          : undefined;
      const [weatherResult, airQualityResult, pollenResult] = await Promise.allSettled(
        [
          weatherPromise,
          airQualityPromise ?? Promise.resolve(undefined),
          pollenPromise ?? Promise.resolve(undefined),
        ] as const,
      );

      if (weatherResult?.status !== "fulfilled") {
        throw weatherResult?.reason;
      }
      reply.header("x-weather-cache", weatherResult.value.cacheStatus);

      const partialFailures = [];
      let airQuality;
      let pollen;
      if (includeAirQuality) {
        if (airQualityPromise === undefined) {
          partialFailures.push({
            resource: "airQuality" as const,
            code: "unsupported" as const,
            message: "Air quality is not available for this provider.",
          });
        } else if (
          airQualityResult?.status === "fulfilled" &&
          airQualityResult.value !== undefined
        ) {
          airQuality = airQualityResult.value.value;
          reply.header(
            "x-air-quality-cache",
            airQualityResult.value.cacheStatus,
          );
        } else {
          request.log.warn(
            {
              error:
                airQualityResult?.status === "rejected"
                  ? airQualityResult.reason
                  : undefined,
            },
            "Air-quality provider failed",
          );
          partialFailures.push({
            resource: "airQuality" as const,
            code: "provider_unavailable" as const,
            message: "Air-quality data is temporarily unavailable.",
          });
        }
      }
      if (includePollen) {
        if (pollenPromise === undefined) {
          partialFailures.push({
            resource: "pollen" as const,
            code: "unsupported" as const,
            message: "Pollen data is not available for this provider.",
          });
        } else if (
          pollenResult?.status === "fulfilled" &&
          pollenResult.value !== undefined
        ) {
          pollen = pollenResult.value.value;
          reply.header("x-pollen-cache", pollenResult.value.cacheStatus);
        } else {
          request.log.warn(
            {
              error:
                pollenResult?.status === "rejected"
                  ? pollenResult.reason
                  : undefined,
            },
            "Pollen provider failed",
          );
          partialFailures.push({
            resource: "pollen" as const,
            code: "provider_unavailable" as const,
            message: "Pollen data is temporarily unavailable.",
          });
        }
      }

      const result = {
        ...weatherResult.value.value,
        ...(airQuality === undefined ? {} : { airQuality }),
        ...(pollen === undefined ? {} : { pollen }),
        ...(partialFailures.length === 0 ? {} : { partialFailures }),
      };

      reply.header(
        "cache-control",
        "public, max-age=60, s-maxage=600, stale-while-revalidate=3600, stale-if-error=86400",
      );
      return WeatherResponseSchema.parse(result);
    } catch (error) {
      request.log.warn({ error }, "Weather provider failed");
      if (error instanceof ProviderBudgetExceededError) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((Date.parse(error.resetsAt) - Date.now()) / 1_000),
        );
        reply.header("retry-after", retryAfterSeconds);
        return reply.status(429).send({
          error: "provider_budget_exhausted",
          message: "This provider has reached its daily refresh budget. Cached forecasts remain available where possible.",
          providerId: error.providerId,
          resetsAt: error.resetsAt,
        });
      }
      return reply.status(502).send({
        error: "weather_provider_unavailable",
        message: "Weather data is temporarily unavailable.",
      });
    }
  });

  app.get("/v1/locations/search", async (request, reply) => {
    const query = LocationSearchQuerySchema.safeParse(request.query);

    if (!query.success) {
      return reply.status(400).send({
        error: "invalid_location_search",
        message: "Enter at least two characters and valid search options.",
      });
    }

    try {
      const results = await locationSearchProvider.search(query.data.q, {
        language: query.data.language,
        limit: query.data.limit,
        ...(query.data.countryCode === undefined
          ? {}
          : { countryCode: query.data.countryCode }),
      });

      reply.header(
        "cache-control",
        "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      );

      return LocationSearchResponseSchema.parse({ results });
    } catch (error) {
      request.log.warn({ error }, "Location search provider failed");
      return reply.status(502).send({
        error: "location_provider_unavailable",
        message: "Location search is temporarily unavailable.",
      });
    }
  });

  return app;
}
