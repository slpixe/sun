import type { Meta, StoryObj } from "@storybook/react-vite";

import { ProviderChooser } from "../ProviderChooser.js";
import { mockProviders } from "./fixtures.js";

const meta = {
  title: "Components/Provider chooser",
  component: ProviderChooser,
  decorators: [(Story) => <main className="shell"><div className="hero"><Story /></div></main>],
  args: {
    providers: mockProviders,
    selectedProviderId: "open-meteo",
    onSelect: () => undefined,
  },
} satisfies Meta<typeof ProviderChooser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const RegistryUnavailable: Story = {
  args: { providers: [], message: "Provider choices could not be loaded." },
};
