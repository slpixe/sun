import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: { name: "@storybook/react-vite", options: {} },
  staticDirs: ["../public"],
  viteFinal(config) {
    if (config.plugins) {
      config.plugins = config.plugins.flat(3).filter(
        (plugin) =>
          typeof plugin !== "object" ||
          plugin === null ||
          !("name" in plugin) ||
          !String(plugin.name).startsWith("vite-plugin-pwa"),
      );
    }
    return config;
  },
};

export default config;
