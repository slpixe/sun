import type { Meta, StoryObj } from "@storybook/react-vite";

import { WeatherView } from "../WeatherView.js";
import { mockProvider, mockWeather } from "./fixtures.js";

const meta = {
  title: "Forecast/Combined forecast",
  component: WeatherView,
  decorators: [(Story) => <main className="shell"><div className="hero"><Story /></div></main>],
  args: {
    weather: mockWeather,
    provider: mockProvider,
    refreshing: false,
    stale: false,
  },
} satisfies Meta<typeof WeatherView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {};

export const RefreshingSavedForecast: Story = {
  args: { refreshing: true, stale: true },
};

export const WeatherOnly: Story = {
  args: {
    weather: {
      ...mockWeather,
      airQuality: undefined,
      pollen: undefined,
    },
  },
};
