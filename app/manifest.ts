import type { MetadataRoute } from "next";

// Permet afegir l'app a la pantalla d'inici (necessari a l'iPhone per rebre recordatoris).
// Sense "start_url": el mòbil obre l'adreça des d'on s'ha afegit (amb l'enllaç personal).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Juvenil C 2026/2027 · CE Europa",
    short_name: "Juvenil C",
    display: "standalone",
    background_color: "#061847",
    theme_color: "#0a2ea0",
    lang: "ca",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
