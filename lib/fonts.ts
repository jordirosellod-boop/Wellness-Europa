import localFont from "next/font/local";
import { Saira_Extra_Condensed } from "next/font/google";

// Escapulada (Murri Studio & CE Europa): NOMÉS per a la pissarra de l'onze (staff).
export const escapulada = localFont({ src: "../app/fonts/Escapulada.ttf", variable: "--font-escapulada", display: "swap" });

// Lletra estreta d'estil samarreta (com la de hummel) per als noms i dorsals de la convocatòria.
export const kitFont = Saira_Extra_Condensed({
  weight: ["600", "800"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-kit",
  display: "swap",
});
