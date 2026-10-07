import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wellness CE Europa",
  description: "Wellness i RPE de l'equip",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#022e91",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ca">
      <body>{children}</body>
    </html>
  );
}
