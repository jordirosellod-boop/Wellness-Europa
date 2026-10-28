import type { Metadata, Viewport } from "next";
import { Anton, Poppins } from "next/font/google";
import "./globals.css";
import { escapulada, kitFont } from "@/lib/fonts";

// Tipografia com la de ceeuropa.cat: títols estrets en majúscules i text en Poppins.
const display = Anton({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
const body = Poppins({ weight: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Juvenil C 2026/2027 · CE Europa",
  description: "Juvenil C 2026/2027 del CE Europa: wellness, RPE, calendari, multes i estadístiques",
  robots: { index: false, follow: false },
  // A l'iPhone, l'app afegida a la pantalla d'inici s'obre a pantalla completa (necessari per als avisos).
  appleWebApp: { capable: true, title: "Juvenil C", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0a2ea0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ca" className={`${escapulada.variable} ${kitFont.variable} ${display.variable} ${body.variable}`}>
      <body>
        {/* Entrada: l'escut apareix i s'esvaeix (només CSS; no bloqueja res i no surt si es demana menys moviment). */}
        <div className="splash" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escut.png" alt="" width={112} height={112} />
          <b>Juvenil C</b>
          <span>CE Europa</span>
        </div>
        {children}
      </body>
    </html>
  );
}
