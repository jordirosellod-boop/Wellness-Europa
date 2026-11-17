"use client";

import { useId } from "react";

// Icones pròpies del club: línia fina en daurat (en lloc dels emojis), totes amb el mateix estil.
const PATHS = {
  petos: "M8.5 3 12 5.5 15.5 3l3.5 3-2 4.5V21H7V10.5L5 6z M9.5 13h5",
  reunio: "M4 4.5h10a2 2 0 0 1 2 2V12a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z M19 8.5h1a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-.5v3l-3.5-3h-3",
  entreno: "M9 3h6v3H9z M6 4.5h2.5 M15.5 4.5H18V21H6V4.5 M9 15l2 2 4-4.5 M9 10.5h6",
  ratxa: "M12 22c3.9 0 7-2.9 7-6.8 0-3.6-2.4-5.6-3.6-9.2-1.8 1.6-2.7 3.4-2.9 5.3-.9-.9-1.6-2.2-1.7-3.8C8 9.7 5 12 5 15.2 5 19.1 8.1 22 12 22z M12 22c-1.8 0-3-1.3-3-3 0-1.9 1.5-3 2.4-4.6.7 1.2 1.3 1.6 2 2 .9-.6 1.4-1.4 1.6-2.4.7 1 1 2.1 1 3.4 0 2.8-1.9 4.6-4 4.6z",
  material: "M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z M9 8V6.5a3 3 0 0 1 6 0V8 M10 13.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  porteria: "M3 18.5V6h18v12.5 M3 6l3 3h12l3-3 M6 9v9.5 M18 9v9.5 M9.5 9v9.5 M14.5 9v9.5 M6 12.5h12 M6 15.5h12",
  avui: "M12 3v2.5 M12 18.5V21 M4.6 4.6l1.8 1.8 M17.6 17.6l1.8 1.8 M3 12h2.5 M18.5 12H21 M4.6 19.4l1.8-1.8 M17.6 6.4l1.8-1.8 M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8",
} as const;
export type ClubIconName = keyof typeof PATHS;

export function ClubIcon({ name, size = 24, className = "" }: { name: ClubIconName; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`club-ico ${className}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none"
      stroke={`url(#g${id})`} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9c15a" /><stop offset=".5" stopColor="#c49128" /><stop offset="1" stopColor="#8a6412" />
        </linearGradient>
      </defs>
      <path d={PATHS[name]} />
    </svg>
  );
}
