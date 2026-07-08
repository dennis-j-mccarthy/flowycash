import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FlowyCash",
    short_name: "FlowyCash",
    description: "Visual cashflow forecasting on a calendar",
    start_url: "/app",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/logo.png", sizes: "any", type: "image/png" },
    ],
  };
}
