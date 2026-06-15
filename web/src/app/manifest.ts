import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MeowDecoder — Feline acoustic intelligence",
    short_name: "MeowDecoder",
    description: "Analyze and interpret your cat's vocalizations.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdfa",
    theme_color: "#a34715",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
