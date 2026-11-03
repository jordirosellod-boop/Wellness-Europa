import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // L'anàlisi incrusta vídeos de YouTube: YouTube exigeix saber des de quina web es mira
        // (només l'adreça principal de l'app, mai la pàgina ni els paràmetres).
        source: "/entrenador/analisi",
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
    ];
  },
};

export default nextConfig;
