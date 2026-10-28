import type { MetadataRoute } from "next";

// Makes the app installable ("Add to Home screen") on Android and iPhone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERAM Meeting Planner",
    short_name: "ERAM Planner",
    description: "Meetings, tasks and clients for ERAM Holdings",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1F3864",
    icons: [
      { src: "/eram-workforce-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/eram-workforce-app-icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/eram-workforce-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
