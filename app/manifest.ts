import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stride Console",
    short_name: "Stride",
    description: "The Stride AI marketing machine. Press a button, get a post.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F4F8",
    theme_color: "#3D44D9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
