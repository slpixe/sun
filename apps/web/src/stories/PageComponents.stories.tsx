import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  ForecastLoading,
  LocationPicker,
  SelectedLocationCard,
  type LocationPickerProps,
} from "../WeatherPage.js";
import { mockSearchResults, mockSelection } from "./fixtures.js";

const meta = {
  title: "Components/Page elements",
  decorators: [(Story) => <main className="shell"><div className="hero"><Story /></div></main>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SearchResultsDemo() {
  const [query, setQuery] = useState("London");
  return <LocationPicker query={query} results={mockSearchResults} searchState="success" onQueryChange={setQuery} onSelectLocation={() => undefined} onUseCurrentLocation={() => undefined} />;
}

export const LocationSearch: Story = {
  render: () => <SearchResultsDemo />,
};

export const EmptyLocationSearch: Story = {
  render: () => {
    const props: LocationPickerProps = {
      query: "",
      results: [],
      searchState: "idle",
      showQuickLocations: true,
      onQueryChange: () => undefined,
      onSelectLocation: () => undefined,
      onUseCurrentLocation: () => undefined,
    };
    return <LocationPicker {...props} />;
  },
};

export const SelectedLocation: Story = {
  render: () => (
    <SelectedLocationCard
      selected={mockSelection}
      currentInstant="2026-08-17T11:55:00Z"
    />
  ),
};

export const LoadingForecast: Story = {
  render: () => <ForecastLoading />,
};
