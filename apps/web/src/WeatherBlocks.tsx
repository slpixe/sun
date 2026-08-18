import type {
  AirQualityCategory,
  AirQualityIndexScale,
  AirQualityPoint,
  AirQualityResource,
  CurrentWeather,
  DailyWeatherPoint,
  HourlyWeatherPoint,
  PollenPoint,
  PollenResource,
  ProviderDescriptor,
  WeatherConditionCode,
  WeatherResponse,
} from "@weather/contracts";

const CONDITIONS: Record<WeatherConditionCode, { icon: string; label: string }> = {
  clear: { icon: "☀", label: "Clear" },
  mostly_clear: { icon: "🌤", label: "Mostly clear" },
  partly_cloudy: { icon: "⛅", label: "Partly cloudy" },
  cloudy: { icon: "☁", label: "Cloudy" },
  fog: { icon: "≋", label: "Fog" },
  drizzle: { icon: "🌦", label: "Drizzle" },
  rain: { icon: "🌧", label: "Rain" },
  sleet: { icon: "🌨", label: "Sleet" },
  snow: { icon: "❄", label: "Snow" },
  hail: { icon: "◆", label: "Hail" },
  thunderstorm: { icon: "⛈", label: "Thunderstorm" },
  unknown: { icon: "·", label: "Conditions unavailable" },
};

function condition(value?: WeatherConditionCode) {
  return CONDITIONS[value ?? "unknown"];
}

function temperature(value: number): string {
  return `${Math.round(value)}°`;
}

function temperatureCelsius(value: number): string {
  return `${Math.round(value)}°C`;
}

function uvSeverity(value: number): "metric-warning" | "metric-hazard" | "" {
  if (value >= 8) return "metric-hazard";
  if (value >= 3) return "metric-warning";
  return "";
}

function uvRiskLabel(value: number): string {
  if (value >= 8) return "very high UV; extra protection recommended";
  if (value >= 3) return "sun protection recommended";
  return "low UV";
}

function spatialDataLabel(
  metadata: AirQualityResource["metadata"] | PollenResource["metadata"],
): string {
  const resolution = metadata.nativeResolutionKilometres === undefined
    ? ""
    : `~${metadata.nativeResolutionKilometres.toLocaleString()} km `;
  const model = metadata.modelDomain?.toLowerCase().includes("cams")
    ? "CAMS "
    : "";

  if (metadata.spatialRepresentation === "grid") {
    return `${resolution}${model}grid cell`;
  }
  if (metadata.spatialRepresentation === "point") return "Point forecast";
  if (metadata.spatialRepresentation === "nearest_site") return "Nearest-site data";
  if (metadata.spatialRepresentation === "station") return "Station data";
  if (metadata.spatialRepresentation === "administrative_area") return "Area forecast";
  return "Regional forecast";
}

function visibility(metres: number): string {
  const kilometres = metres / 1_000;
  return `${kilometres >= 10 ? Math.round(kilometres) : kilometres.toFixed(1)} km`;
}

function sourceDistance(metres: number): string {
  return metres < 1_000
    ? `${Math.round(metres)} m away`
    : `${Math.round(metres / 1_000)} km away`;
}

function windTravelDirection(fromDegrees: number): number {
  return (fromDegrees + 180) % 360;
}

function compassDirection(degrees: number): string {
  const directions = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return directions[Math.round(degrees / 22.5) % directions.length] ?? "N";
}

function hourFormatter(timezone: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", timeZone: timezone });
}

function detailTimeFormatter(timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

const AIR_QUALITY_CATEGORY: Record<AirQualityCategory, string> = {
  good: "Good",
  fair: "Fair",
  moderate: "Moderate",
  poor: "Poor",
  very_poor: "Very poor",
  extremely_poor: "Extremely poor",
  unhealthy_for_sensitive_groups: "Unhealthy for sensitive groups",
  unhealthy: "Unhealthy",
  very_unhealthy: "Very unhealthy",
  hazardous: "Hazardous",
  unknown: "Unknown",
};

function airQualitySeverity(
  category: AirQualityCategory,
): "metric-warning" | "metric-hazard" | "" {
  if (category === "moderate") return "metric-warning";
  if (
    category === "poor"
    || category === "very_poor"
    || category === "extremely_poor"
    || category === "unhealthy_for_sensitive_groups"
    || category === "unhealthy"
    || category === "very_unhealthy"
    || category === "hazardous"
  ) return "metric-hazard";
  return "";
}

function europeanAqi(point?: AirQualityPoint) {
  return point?.indices.find((index) => index.scale === "european-aqi") ?? point?.indices[0];
}

function airQualityScaleLabel(scale: AirQualityIndexScale): string {
  if (scale === "us-epa") return "US EPA AQI";
  if (scale === "european-aqi") return "European AQI";
  if (scale === "visual-crossing-european-category") return "European AQI (1–6)";
  if (scale === "uk-defra") return "UK DEFRA";
  if (scale === "eu-caqi") return "EU CAQI";
  if (scale === "canadian-aqhi") return "Canadian AQHI";
  if (scale === "openweather-1-5") return "OpenWeather AQI (1–5)";
  if (scale === "weatherapi-us-epa-category") return "US EPA category (1–6)";
  return "Provider AQI";
}

function pollutant(
  point: AirQualityPoint | undefined,
  key: keyof AirQualityPoint["pollutants"],
): string | undefined {
  const concentration = point?.pollutants[key];
  if (concentration === undefined) return undefined;
  const value = concentration.value < 10
    ? concentration.value.toFixed(1)
    : Math.round(concentration.value).toString();
  const unit = concentration.unit === "micrograms_per_cubic_metre"
    ? "µg/m³"
    : concentration.unit === "parts_per_billion"
      ? "ppb"
      : "ppm";
  return `${value} ${unit}`;
}

const POLLEN_LABELS: Record<keyof PollenPoint["concentrations"], string> = {
  hazel: "Hazel",
  alder: "Alder",
  birch: "Birch",
  oak: "Oak",
  grass: "Grass",
  mugwort: "Mugwort",
  olive: "Olive",
  ragweed: "Ragweed",
};

function pollenValues(point: PollenPoint) {
  return Object.entries(point.concentrations)
    .flatMap(([key, concentration]) => concentration === undefined ? [] : [{
      key: key as keyof PollenPoint["concentrations"],
      value: concentration.value,
    }])
    .sort((left, right) => right.value - left.value);
}

export interface ForecastStatusProps {
  refreshing?: boolean;
  stale?: boolean;
  message?: string;
}

export function ForecastStatus({
  refreshing = false,
  stale = false,
  message,
}: ForecastStatusProps) {
  return (
    <p className={`forecast-status${stale ? " is-stale" : ""}`} role="status">
      {refreshing
        ? stale
          ? "Updating saved forecast…"
          : "Updating forecast…"
        : message ?? "Showing the last saved forecast."}
    </p>
  );
}

export interface CurrentWeatherBlockProps {
  current: CurrentWeather;
  currentHour?: HourlyWeatherPoint;
  today?: DailyWeatherPoint;
  timezone: string;
}

export function CurrentWeatherBlock({
  current,
  currentHour,
  today,
  timezone,
}: CurrentWeatherBlockProps) {
  const timeFormatter = detailTimeFormatter(timezone);
  const precipitation = current.precipitationProbabilityPercent
    ?? currentHour?.precipitationProbabilityPercent;
  const travelDirection = current.windDirectionDegrees === undefined
    ? undefined
    : windTravelDirection(current.windDirectionDegrees);

  return (
    <article className="current-weather">
      <div>
        <p className="card-label">Right now</p>
        <div className="current-reading">
          <span className="current-icon" aria-hidden="true">{condition(current.condition).icon}</span>
          <strong
            aria-label={`${Math.round(current.temperatureCelsius)} degrees Celsius`}
          >
            {Math.round(current.temperatureCelsius)}
            <span className="current-temperature-unit" aria-hidden="true">
              °C
            </span>
          </strong>
        </div>
        <p className="condition-label">{condition(current.condition).label}</p>
      </div>
      <dl>
        {current.feelsLikeCelsius !== undefined && <div><dt>Feels like</dt><dd>{temperatureCelsius(current.feelsLikeCelsius)}</dd></div>}
        {current.relativeHumidityPercent !== undefined && <div><dt>Humidity</dt><dd>{Math.round(current.relativeHumidityPercent)}%</dd></div>}
        {today && <div><dt>Today</dt><dd className="high-low"><span>High {temperature(today.maximumTemperatureCelsius)}</span><span>Low {temperature(today.minimumTemperatureCelsius)}</span></dd></div>}
        {precipitation !== undefined && <div><dt>Precipitation</dt><dd>{Math.round(precipitation)}%</dd></div>}
        {currentHour?.uvIndex !== undefined && <div><dt>UV</dt><dd className="current-pair"><span className={uvSeverity(currentHour.uvIndex)} aria-label={`Current UV ${currentHour.uvIndex.toFixed(1)}; ${uvRiskLabel(currentHour.uvIndex)}`}>{currentHour.uvIndex.toFixed(1)}</span>{today?.maximumUvIndex !== undefined && <span className={uvSeverity(today.maximumUvIndex)} aria-label={`Today's maximum UV ${today.maximumUvIndex.toFixed(1)}; ${uvRiskLabel(today.maximumUvIndex)}`}>Max {today.maximumUvIndex.toFixed(1)}</span>}</dd></div>}
        {currentHour?.visibilityMetres !== undefined && <div><dt>Visibility</dt><dd>{visibility(currentHour.visibilityMetres)}</dd></div>}
        {current.windSpeedMetresPerSecond !== undefined && (
          <div><dt>Wind</dt><dd className="wind-reading">
            {Math.round(current.windSpeedMetresPerSecond * 3.6)} km/h
            {travelDirection !== undefined && <span className="wind-direction" style={{ transform: `rotate(${travelDirection}deg)` }} aria-label={`toward ${compassDirection(travelDirection)}`} title={`Wind travelling toward ${compassDirection(travelDirection)}`}>↑</span>}
          </dd></div>
        )}
        {today?.sunriseAt && today.sunsetAt && <div><dt>Sun</dt><dd className="sun-times"><span title="Sunrise">↑ {timeFormatter.format(new Date(today.sunriseAt))}</span><span title="Sunset">↓ {timeFormatter.format(new Date(today.sunsetAt))}</span></dd></div>}
      </dl>
    </article>
  );
}

export interface HourlyForecastBlockProps {
  hourly: HourlyWeatherPoint[];
  timezone: string;
  provider?: ProviderDescriptor;
}

export function HourlyForecastBlock({ hourly, timezone, provider }: HourlyForecastBlockProps) {
  const formatter = hourFormatter(timezone);
  const granularity = provider?.dataProfile?.hourlyGranularity;
  const granularityLabel = granularity === undefined ? "" : {
    hourly: "Hourly",
    three_hourly: "3-hour steps",
    variable_interval: "1h then 6h",
    unavailable: "Unavailable",
  }[granularity];
  return (
    <section className="forecast-panel">
      <div className="panel-heading"><h3>Hourly forecast</h3><span>{timezone.replace("_", " ")}{granularityLabel ? ` · ${granularityLabel}` : ""}</span></div>
      <div className="hourly-list" tabIndex={0} aria-label="Scrollable hourly forecast">
        {hourly.map((hour) => <article key={hour.validAt}>
          <time dateTime={hour.validAt}>{formatter.format(new Date(hour.validAt))}</time>
          <span
            className="weather-icon"
            role="img"
            aria-label={condition(hour.condition).label}
            title={condition(hour.condition).label}
          >
            {condition(hour.condition).icon}
          </span>
          <strong>{temperature(hour.temperatureCelsius)}</strong>
          <small aria-label={`${Math.round(hour.precipitationProbabilityPercent ?? 0)}% precipitation`}>{Math.round(hour.precipitationProbabilityPercent ?? 0)}%</small>
          {hour.uvIndex !== undefined && <small className={`hourly-uv ${uvSeverity(hour.uvIndex)}`.trim()} aria-label={`UV ${hour.uvIndex.toFixed(1)}; ${uvRiskLabel(hour.uvIndex)}`}>UV {hour.uvIndex.toFixed(1)}</small>}
        </article>)}
      </div>
    </section>
  );
}

export interface AirQualityBlockProps {
  airQuality: AirQualityResource;
  timezone: string;
}

export function AirQualityBlock({ airQuality, timezone }: AirQualityBlockProps) {
  const current = airQuality.current;
  const currentAqi = europeanAqi(current);
  if (current === undefined || currentAqi === undefined) return null;
  const hour = hourFormatter(timezone);
  const pollutantFields = [
    ["PM1", "particulateMatter1"], ["PM2.5", "particulateMatter2_5"],
    ["PM10", "particulateMatter10"], ["NO₂", "nitrogenDioxide"],
    ["O₃", "ozone"], ["CO", "carbonMonoxide"], ["SO₂", "sulphurDioxide"],
  ] as const;
  return (
    <section className="forecast-panel air-quality-panel">
      <div className="panel-heading"><h3>Air quality</h3><span>{spatialDataLabel(airQuality.metadata)}</span></div>
      <div className="air-quality-current">
        <div className={`aqi-badge aqi-${currentAqi.category ?? "unknown"}`}><strong>{Math.round(currentAqi.value)}</strong><span>{airQualityScaleLabel(currentAqi.scale)}</span></div>
        <div><p className="air-quality-category">{AIR_QUALITY_CATEGORY[currentAqi.category ?? "unknown"]}</p><dl className="pollutant-list">
          {pollutantFields.map(([label, key]) => {
            const value = pollutant(current, key);
            return value === undefined ? null : <div key={key}><dt>{label}</dt><dd>{value}</dd></div>;
          })}
        </dl></div>
      </div>
      {airQuality.hourly && airQuality.hourly.length > 0 && <div className="air-quality-hourly" aria-label="Scrollable hourly air quality" tabIndex={0}>
        {airQuality.hourly.map((point) => {
          const index = europeanAqi(point);
          if (index === undefined) return null;
          const category = index.category ?? "unknown";
          return <article key={point.validAt}><time dateTime={point.validAt}>{hour.format(new Date(point.validAt))}</time><strong className={airQualitySeverity(category)} aria-label={`${Math.round(index.value)} ${airQualityScaleLabel(index.scale)}, ${AIR_QUALITY_CATEGORY[category]}`}>{Math.round(index.value)}</strong><small>PM2.5 {pollutant(point, "particulateMatter2_5") ?? "–"}</small></article>;
        })}
      </div>}
    </section>
  );
}

export interface PollenBlockProps {
  pollen: PollenResource;
  timezone: string;
}

export function PollenBlock({ pollen, timezone }: PollenBlockProps) {
  const current = pollen.current ?? pollen.hourly?.[0];
  if (current === undefined) return <ForecastStatus message="Pollen data is not available for this location or season." />;
  const hour = hourFormatter(timezone);
  return (
    <section className="forecast-panel pollen-panel">
      <div className="panel-heading"><h3>Pollen</h3><span>{spatialDataLabel(pollen.metadata)}</span></div>
      <dl className="pollen-current">{pollenValues(current).map(({ key, value }) => <div key={key}><dt>{POLLEN_LABELS[key]}</dt><dd>{value < 10 ? value.toFixed(1) : Math.round(value)} grains/m³</dd></div>)}</dl>
      {pollen.hourly && pollen.hourly.length > 0 && <div className="pollen-hourly" aria-label="Scrollable hourly pollen" tabIndex={0}>{pollen.hourly.map((point) => {
        const strongest = pollenValues(point)[0];
        return strongest === undefined ? null : <article key={point.validAt}><time dateTime={point.validAt}>{hour.format(new Date(point.validAt))}</time><strong>{Math.round(strongest.value)}</strong><small>{POLLEN_LABELS[strongest.key]}</small></article>;
      })}</div>}
      <p className="pollen-note">
        {pollen.metadata.providerId === "open-meteo" ? <>Europe-only <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noreferrer">CAMS ENSEMBLE</a> grid forecast via <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo</a>; species may be absent outside their season.</> : pollen.metadata.providerId === "weatherapi" ? <>WeatherAPI.com point forecast for supported cities and subscription plans in the US, Canada, UK, and Europe.</> : <>Provider pollen forecast; availability may vary by location and season.</>}
      </p>
    </section>
  );
}

export interface DailyForecastBlockProps {
  daily: DailyWeatherPoint[];
  timezone: string;
  provider?: ProviderDescriptor;
}

export function DailyForecastBlock({ daily, timezone, provider }: DailyForecastBlockProps) {
  const day = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
  const time = detailTimeFormatter(timezone);
  return (
    <section className="forecast-panel">
      <div className="panel-heading"><h3>{daily.length}-day forecast</h3>{provider?.dataProfile?.dailyGranularity === "derived" && <span>Derived from forecast steps</span>}</div>
      <div className="daily-list">{daily.map((point, index) => <article key={point.date}>
        <time className="daily-day" dateTime={point.date}>{index === 0 ? "Today" : day.format(new Date(`${point.date}T12:00:00Z`))}</time>
        <span className="weather-icon daily-icon" aria-hidden="true">{condition(point.condition).icon}</span>
        <span className="daily-condition">{condition(point.condition).label}</span>
        <span className="daily-sun">{point.sunriseAt && point.sunsetAt && <><span aria-label="Sunrise">↑ {time.format(new Date(point.sunriseAt))}</span><span aria-label="Sunset">↓ {time.format(new Date(point.sunsetAt))}</span></>}</span>
        <span className={`daily-uv ${point.maximumUvIndex === undefined ? "" : uvSeverity(point.maximumUvIndex)}`.trim()} {...(point.maximumUvIndex === undefined ? {} : { "aria-label": `Maximum UV ${point.maximumUvIndex.toFixed(1)}; ${uvRiskLabel(point.maximumUvIndex)}` })}>{point.maximumUvIndex === undefined ? "" : `UV ${point.maximumUvIndex.toFixed(1)}`}</span>
        <strong className="daily-high">{temperatureCelsius(point.maximumTemperatureCelsius)}</strong>
        <small className="daily-low">{temperatureCelsius(point.minimumTemperatureCelsius)}</small>
      </article>)}</div>
    </section>
  );
}

export interface ForecastMetadataProps {
  metadata: WeatherResponse["metadata"];
  provider?: ProviderDescriptor;
}

export function ForecastMetadata({ metadata, provider }: ForecastMetadataProps) {
  const source = metadata.sourceLocation;
  return (
    <p className="forecast-meta">
      Updated {new Date(metadata.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      {source && <> · {source.displayName ?? "Nearest forecast site"}{source.distanceFromRequestedMetres === undefined ? "" : ` · ${sourceDistance(source.distanceFromRequestedMetres)}`}</>} · {" "}
      {provider?.attribution.url ? <a href={provider.attribution.url} target="_blank" rel="noreferrer">{provider.attribution.text}</a> : provider?.attribution.text ?? metadata.providerId}
    </p>
  );
}
