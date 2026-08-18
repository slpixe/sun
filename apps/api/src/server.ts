// Keep the framework import in the detected entrypoint for Vercel's Fastify builder.
import "fastify";
import { z } from "zod";
import { MetNorwayWeatherProvider } from "@weather/provider-met-norway";
import { MetOfficeWeatherProvider } from "@weather/provider-met-office";
import {
  OpenWeatherAirQualityProvider,
  OpenWeatherProvider,
} from "@weather/provider-openweather";
import { PirateWeatherProvider } from "@weather/provider-pirate-weather";
import {
  OpenMeteoAirQualityProvider,
  OpenMeteoLocationSearchProvider,
  OpenMeteoWeatherProvider,
} from "@weather/provider-open-meteo";
import { VisualCrossingWeatherProvider } from "@weather/provider-visual-crossing";
import { TomorrowIoProvider } from "@weather/provider-tomorrow-io";
import { WeatherApiProvider } from "@weather/provider-weatherapi";
import { WeatherbitProvider } from "@weather/provider-weatherbit";
import {
  InMemoryProviderLoadBudget,
  UpstashRedisStore,
} from "@weather/provider-core";

import { buildApp } from "./create-app.js";
import {
  createTimeoutFetch,
  parseCorsAllowedOrigins,
} from "./runtime-safety.js";

const ProviderDailyLoadBudgetsSchema = z.record(
  z.string().trim().min(1),
  z.number().int().positive(),
);

const EnvironmentSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_001),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  CORS_ALLOWED_ORIGINS: z.string().trim().min(1).optional(),
  UPSTREAM_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(30_000)
    .default(10_000),
  MET_NORWAY_USER_AGENT: z.string().trim().min(10).optional(),
  VISUAL_CROSSING_API_KEY: z.string().trim().min(8).optional(),
  OPENWEATHER_API_KEY: z.string().trim().min(8).optional(),
  WEATHERAPI_API_KEY: z.string().trim().min(8).optional(),
  PIRATE_WEATHER_API_KEY: z.string().trim().min(8).optional(),
  TOMORROW_IO_API_KEY: z.string().trim().min(8).optional(),
  TOMORROW_IO_AIR_QUALITY_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  WEATHERBIT_API_KEY: z.string().trim().min(8).optional(),
  MET_OFFICE_API_KEY: z.string().trim().min(8).optional(),
  KV_REST_API_URL: z.url().startsWith("https://").optional(),
  KV_REST_API_TOKEN: z.string().trim().min(8).optional(),
  UPSTASH_REDIS_REST_URL: z.url().startsWith("https://").optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().min(8).optional(),
  PROVIDER_DAILY_LOAD_BUDGETS: z
    .string()
    .default("{}")
    .transform((value, context) => {
      try {
        return ProviderDailyLoadBudgetsSchema.parse(JSON.parse(value));
      } catch {
        context.addIssue({
          code: "custom",
          message:
            "PROVIDER_DAILY_LOAD_BUDGETS must be a JSON object of positive integers",
        });
        return z.NEVER;
      }
    }),
});

const environment = EnvironmentSchema.parse(process.env);
const corsAllowedOrigins = parseCorsAllowedOrigins(
  environment.CORS_ALLOWED_ORIGINS,
  { required: environment.VERCEL_ENV === "production" },
);
const upstreamFetch = createTimeoutFetch(
  environment.UPSTREAM_REQUEST_TIMEOUT_MS,
);
const redisUrl =
  environment.UPSTASH_REDIS_REST_URL ?? environment.KV_REST_API_URL;
const redisToken =
  environment.UPSTASH_REDIS_REST_TOKEN ?? environment.KV_REST_API_TOKEN;
if (
  (redisUrl === undefined) !==
  (redisToken === undefined)
) {
  throw new Error(
    "Redis REST URL and token must be configured together",
  );
}
const sharedStore =
  redisUrl === undefined || redisToken === undefined
    ? undefined
    : new UpstashRedisStore({
        url: redisUrl,
        token: redisToken,
      });
const openMeteoEnvironmentProvider = new OpenMeteoAirQualityProvider({
  fetch: upstreamFetch,
});
const providerDailyLoadBudgets = {
  ...(environment.MET_OFFICE_API_KEY === undefined
    ? {}
    : { "met-office": 100 }),
  ...environment.PROVIDER_DAILY_LOAD_BUDGETS,
};
const app = buildApp({
  ...(corsAllowedOrigins === undefined ? {} : { corsAllowedOrigins }),
  locationSearchProvider: new OpenMeteoLocationSearchProvider({
    fetch: upstreamFetch,
  }),
  ...(sharedStore === undefined ? {} : { weatherCache: sharedStore }),
  providerLoadBudget:
    sharedStore ?? new InMemoryProviderLoadBudget(),
  providerDailyLoadBudgets,
  weatherProviders: [
    new OpenMeteoWeatherProvider({ fetch: upstreamFetch }),
    ...(environment.MET_NORWAY_USER_AGENT === undefined
      ? []
      : [
          new MetNorwayWeatherProvider({
            userAgent: environment.MET_NORWAY_USER_AGENT,
            fetch: upstreamFetch,
          }),
        ]),
    ...(environment.VISUAL_CROSSING_API_KEY === undefined
      ? []
      : [
          new VisualCrossingWeatherProvider({
            apiKey: environment.VISUAL_CROSSING_API_KEY,
            fetch: upstreamFetch,
          }),
        ]),
    ...(environment.OPENWEATHER_API_KEY === undefined
      ? []
      : [
          new OpenWeatherProvider({
            apiKey: environment.OPENWEATHER_API_KEY,
            fetch: upstreamFetch,
          }),
        ]),
    ...(environment.WEATHERAPI_API_KEY === undefined
      ? []
      : [
          new WeatherApiProvider({
            apiKey: environment.WEATHERAPI_API_KEY,
            fetch: upstreamFetch,
          }),
        ]),
    ...(environment.PIRATE_WEATHER_API_KEY === undefined
      ? []
      : [
          new PirateWeatherProvider({
            apiKey: environment.PIRATE_WEATHER_API_KEY,
            fetch: upstreamFetch,
          }),
        ]),
    ...(environment.TOMORROW_IO_API_KEY === undefined
      ? []
      : [
          new TomorrowIoProvider({
            apiKey: environment.TOMORROW_IO_API_KEY,
            airQualityEnabled: environment.TOMORROW_IO_AIR_QUALITY_ENABLED,
            fetch: upstreamFetch,
          }),
        ]),
    ...(environment.WEATHERBIT_API_KEY === undefined
      ? []
      : [
          new WeatherbitProvider({
            apiKey: environment.WEATHERBIT_API_KEY,
            fetch: upstreamFetch,
          }),
        ]),
    ...(environment.MET_OFFICE_API_KEY === undefined
      ? []
      : [
          new MetOfficeWeatherProvider({
            apiKey: environment.MET_OFFICE_API_KEY,
            fetch: upstreamFetch,
          }),
        ]),
  ],
  airQualityProviders: [
    openMeteoEnvironmentProvider,
    ...(environment.OPENWEATHER_API_KEY === undefined
      ? []
      : [
          new OpenWeatherAirQualityProvider({
            apiKey: environment.OPENWEATHER_API_KEY,
            fetch: upstreamFetch,
          }),
        ]),
  ],
  pollenProviders: [openMeteoEnvironmentProvider],
});

app.listen({ host: environment.HOST, port: environment.PORT });
