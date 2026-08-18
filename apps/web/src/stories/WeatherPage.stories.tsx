import type { Meta, StoryObj } from "@storybook/react-vite";

import { WeatherPage } from "../WeatherPage.js";
import {
  mockProviders,
  mockSearchResults,
  mockSelection,
  mockWeather,
} from "./fixtures.js";

const noop = () => undefined;

const meta = {
  title: "Pages/Weather",
  component: WeatherPage,
  args: {
    query: "",
    results: [],
    searchState: "idle",
    forecastState: "idle",
    providers: mockProviders,
    currentInstant: "2026-08-17T11:55:00Z",
    onQueryChange: noop,
    onSelectLocation: noop,
    onUseCurrentLocation: noop,
    onSelectProvider: noop,
  },
} satisfies Meta<typeof WeatherPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompleteForecast: Story = {
  args: {
    selected: mockSelection,
    weather: mockWeather,
    forecastState: "success",
  },
};

export const Empty: Story = {};

export const SearchResults: Story = {
  args: {
    query: "London",
    results: mockSearchResults,
    searchState: "success",
  },
};

export const Loading: Story = {
  args: {
    selected: mockSelection,
    forecastState: "loading",
  },
};

export const ForecastError: Story = {
  args: {
    selected: mockSelection,
    forecastState: "error",
    forecastMessage: "The forecast is temporarily unavailable. Please try again shortly.",
  },
};
