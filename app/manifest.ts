import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OreFair",
    short_name: "OreFair",
    description:
      "AI-powered fair pricing and traceability for artisanal miners. Classify ore photos, get reference-priced quotes, and record transactions on a tamper-evident hash chain.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#78350f",
    theme_color: "#b45309",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}