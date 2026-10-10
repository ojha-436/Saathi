import type { MetadataRoute } from "next";

/** Web app manifest: lets people install Saathi to their Home Screen (required for push on iPhone/iPad, iOS 16.4+). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Saathi — the AI workspace that remembers",
    short_name: "Saathi",
    description: "Team chat with an AI colleague: find anything, catch up, and track every promise.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#efeae9",
    theme_color: "#efeae9",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
