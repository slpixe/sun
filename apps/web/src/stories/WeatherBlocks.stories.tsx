import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  AirQualityBlock,
  CurrentWeatherBlock,
  DailyForecastBlock,
  ForecastMetadata,
  ForecastStatus,
  HourlyForecastBlock,
  PollenBlock,
} from "../WeatherBlocks.js";
import { mockProvider, mockWeather } from "./fixtures.js";

const meta = {
  title: "Forecast/Blocks",
  decorators: [
    (Story) => (
      <main className="shell">
        <div className="hero">
          <div className="forecast"><Story /></div>
        </div>
      </main>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Now: Story = {
  render: () => <CurrentWeatherBlock current={mockWeather.current!} currentHour={mockWeather.hourly![0]!} today={mockWeather.daily![0]!} timezone={mockWeather.location.timezone} />,
};

export const LowUvNow: Story = {
  render: () => <CurrentWeatherBlock current={mockWeather.current!} currentHour={{ ...mockWeather.hourly![0]!, uvIndex: 1.8 }} today={{ ...mockWeather.daily![0]!, maximumUvIndex: 2.1 }} timezone={mockWeather.location.timezone} />,
};

export const VeryHighUvNow: Story = {
  render: () => <CurrentWeatherBlock current={mockWeather.current!} currentHour={{ ...mockWeather.hourly![0]!, uvIndex: 9.2 }} today={{ ...mockWeather.daily![0]!, maximumUvIndex: 9.8 }} timezone={mockWeather.location.timezone} />,
};

export const Hourly: Story = {
  render: () => <HourlyForecastBlock hourly={mockWeather.hourly!} timezone={mockWeather.location.timezone} provider={mockProvider} />,
};

export const AirQuality: Story = {
  render: () => <AirQualityBlock airQuality={mockWeather.airQuality!} timezone={mockWeather.location.timezone} />,
};

export const PoorAirQuality: Story = {
  render: () => {
    const airQuality = {
      ...mockWeather.airQuality!,
      current: {
        ...mockWeather.airQuality!.current!,
        indices: mockWeather.airQuality!.current!.indices.map((index) => ({
          ...index,
          value: 96,
          category: "poor" as const,
        })),
      },
      hourly: mockWeather.airQuality!.hourly?.map((point, pointIndex) => ({
        ...point,
        indices: point.indices.map((index) => ({
          ...index,
          value: 96 + pointIndex * 3,
          category: "poor" as const,
        })),
      })),
    };
    return <AirQualityBlock airQuality={airQuality} timezone={mockWeather.location.timezone} />;
  },
};

export const Pollen: Story = {
  render: () => <PollenBlock pollen={mockWeather.pollen!} timezone={mockWeather.location.timezone} />,
};

export const SevenDay: Story = {
  render: () => <DailyForecastBlock daily={mockWeather.daily!} timezone={mockWeather.location.timezone} provider={mockProvider} />,
};

export const RefreshingStatus: Story = {
  render: () => <ForecastStatus refreshing />,
};

export const StaleStatus: Story = {
  render: () => <ForecastStatus stale message="The provider could not be reached. Showing the last saved forecast." />,
};

export const Metadata: Story = {
  render: () => <ForecastMetadata metadata={mockWeather.metadata} provider={mockProvider} />,
};
