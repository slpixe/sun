import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["weather.svg"],
      manifest: {
        name: "Weather",
        short_name: "Weather",
        description: "Compare forecasts from multiple weather providers.",
        theme_color: "#07111f",
        background_color: "#07111f",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/weather.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  server: {
    port: 3_000,
  },
});
