import type { ProviderDescriptor, WeatherResponse } from "@weather/contracts";

import {
  AirQualityBlock,
  CurrentWeatherBlock,
  DailyForecastBlock,
  ForecastMetadata,
  ForecastStatus,
  HourlyForecastBlock,
  PollenBlock,
} from "./WeatherBlocks.js";

export interface WeatherViewProps {
  weather: WeatherResponse;
  provider?: ProviderDescriptor;
  refreshing: boolean;
  stale: boolean;
  message?: string;
}

export function WeatherView({
  weather,
  provider,
  refreshing,
  stale,
  message,
}: WeatherViewProps) {
  const airQualityFailure = weather.partialFailures?.find(
    (failure) => failure.resource === "airQuality",
  );
  const pollenFailure = weather.partialFailures?.find(
    (failure) => failure.resource === "pollen",
  );

  return (
    <section className="forecast" aria-live="polite">
      {(refreshing || stale || message) && (
        <ForecastStatus
          refreshing={refreshing}
          stale={stale}
          {...(message === undefined ? {} : { message })}
        />
      )}
      {weather.current && (
        <CurrentWeatherBlock
          current={weather.current}
          timezone={weather.location.timezone}
          {...(weather.hourly?.[0] === undefined
            ? {}
            : { currentHour: weather.hourly[0] })}
          {...(weather.daily?.[0] === undefined
            ? {}
            : { today: weather.daily[0] })}
        />
      )}
      {weather.hourly && (
        <HourlyForecastBlock
          hourly={weather.hourly}
          timezone={weather.location.timezone}
          {...(provider === undefined ? {} : { provider })}
        />
      )}
      {weather.airQuality && (
        <AirQualityBlock
          airQuality={weather.airQuality}
          timezone={weather.location.timezone}
        />
      )}
      {airQualityFailure && (
        <ForecastStatus stale message={airQualityFailure.message} />
      )}
      {weather.pollen && (
        <PollenBlock
          pollen={weather.pollen}
          timezone={weather.location.timezone}
        />
      )}
      {pollenFailure && (
        <ForecastStatus stale message={pollenFailure.message} />
      )}
      {weather.daily && (
        <DailyForecastBlock
          daily={weather.daily}
          timezone={weather.location.timezone}
          {...(provider === undefined ? {} : { provider })}
        />
      )}
      <ForecastMetadata
        metadata={weather.metadata}
        {...(provider === undefined ? {} : { provider })}
      />
    </section>
  );
}
