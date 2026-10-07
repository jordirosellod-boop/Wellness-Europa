import type { Metadata, Viewport } from "next";
import { Anton, Poppins } from "next/font/google";
import "./globals.css";

// Tipografia com la de ceeuropa.cat: títols estrets en majúscules i text en Poppins.
const display = Anton({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
const body = Poppins({ weight: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Wellness CE Europa",
  description: "Wellness i RPE de l'equip",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a2ea0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ca" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
