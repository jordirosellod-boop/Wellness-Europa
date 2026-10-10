import localFont from "next/font/local";

// Escapulada (Murri Studio & CE Europa): NOMÉS per a la pissarra de l'onze (staff).
export const escapulada = localFont({ src: "../app/fonts/Escapulada.ttf", variable: "--font-escapulada", display: "swap" });

// Lletra de samarreta (la de hummel de la imatge que va enviar el club), redibuixada lletra a
// lletra a partir d'aquella imatge. Només majúscules, números, Ñ, accents, ·, -, punt i apòstrof.
export const kitFont = localFont({ src: "../app/fonts/CEEuropaKit.woff2", variable: "--font-kit", display: "swap" });
