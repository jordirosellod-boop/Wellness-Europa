import type { ReactNode } from "react";

export type EmptyArt = "ball" | "board" | "calendar" | "list" | "chart" | "video" | "rest" | "party";

const B = "var(--blau)", O = "var(--or)", W = "#fff", L = "#dfe6f7";

/** Dibuixets senzills amb els colors del club per a les pantalles buides. */
function Art({ kind }: { kind: EmptyArt }) {
  const body: Record<EmptyArt, ReactNode> = {
    ball: (
      <>
        <circle cx="60" cy="54" r="26" fill={W} stroke={B} strokeWidth="3" />
        <path d="M60 41l9 6.5-3.4 10.5h-11.2L51 47.5z" fill={B} />
        <path d="M60 41v-13M69 47.5l12-4M65.6 58l7 10M54.4 58l-7 10M51 47.5l-12-4" stroke={B} strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
    board: (
      <>
        <rect x="28" y="28" width="64" height="48" rx="6" fill="#2f9e5b" stroke={B} strokeWidth="3" />
        <path d="M60 28v48M28 52h64" stroke={W} strokeWidth="1.6" opacity=".8" />
        <circle cx="60" cy="52" r="8" fill="none" stroke={W} strokeWidth="1.6" opacity=".8" />
        <path d="M40 40l14 8" stroke={O} strokeWidth="3" strokeLinecap="round" strokeDasharray="4 4" />
        <path d="M54 48l-5 0.5 2.6 4.2z" fill={O} />
        <circle cx="40" cy="40" r="4" fill={W} /><circle cx="76" cy="64" r="4" fill={O} />
      </>
    ),
    calendar: (
      <>
        <rect x="32" y="30" width="56" height="50" rx="8" fill={W} stroke={B} strokeWidth="3" />
        <path d="M32 44h56" stroke={B} strokeWidth="3" />
        <path d="M45 24v12M75 24v12" stroke={B} strokeWidth="3.4" strokeLinecap="round" />
        <rect x="42" y="52" width="9" height="8" rx="2" fill={L} /><rect x="56" y="52" width="9" height="8" rx="2" fill={O} /><rect x="70" y="52" width="9" height="8" rx="2" fill={L} />
        <rect x="42" y="65" width="9" height="8" rx="2" fill={L} /><rect x="56" y="65" width="9" height="8" rx="2" fill={L} />
      </>
    ),
    list: (
      <>
        <rect x="36" y="26" width="48" height="56" rx="7" fill={W} stroke={B} strokeWidth="3" />
        <rect x="48" y="21" width="24" height="10" rx="4" fill={O} />
        <path d="M46 46l4 4 7-8M46 62l4 4 7-8" stroke={B} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M62 46h14M62 62h14" stroke={L} strokeWidth="4" strokeLinecap="round" />
      </>
    ),
    chart: (
      <>
        <path d="M30 78h60" stroke={B} strokeWidth="3" strokeLinecap="round" />
        <rect x="36" y="56" width="10" height="22" rx="3" fill={L} /><rect x="52" y="44" width="10" height="34" rx="3" fill={B} /><rect x="68" y="32" width="10" height="46" rx="3" fill={O} />
        <path d="M38 48l16-10 14 4 14-14" stroke={B} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 4" />
      </>
    ),
    video: (
      <>
        <rect x="28" y="34" width="50" height="40" rx="7" fill={W} stroke={B} strokeWidth="3" />
        <path d="M78 48l14-8v28l-14-8z" fill={O} stroke={B} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M47 46v16l13-8z" fill={B} />
      </>
    ),
    rest: (
      <>
        <path d="M70 30a24 24 0 1 0 18 34 20 20 0 0 1-18-34z" fill={O} />
        <text x="34" y="44" fontSize="14" fontWeight="700" fill={B}>z</text>
        <text x="42" y="34" fontSize="11" fontWeight="700" fill={B} opacity=".7">z</text>
        <circle cx="38" cy="70" r="2" fill={B} opacity=".5" /><circle cx="90" cy="34" r="2" fill={B} opacity=".5" />
      </>
    ),
    party: (
      <>
        <path d="M40 80l12-40 28 28z" fill={O} stroke={B} strokeWidth="3" strokeLinejoin="round" />
        <path d="M50 58l10 10M46 70l6 6" stroke={W} strokeWidth="3" strokeLinecap="round" />
        <circle cx="72" cy="34" r="3" fill={B} /><circle cx="86" cy="50" r="3" fill={O} /><rect x="80" y="28" width="5" height="5" rx="1" fill={B} transform="rotate(20 82 30)" />
        <path d="M62 30q4-8 10-4M84 62q8-2 8 6" stroke={B} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <svg className="empty-art" viewBox="0 0 120 100" width="120" height="100" aria-hidden="true">
      <ellipse cx="60" cy="88" rx="34" ry="6" fill={B} opacity=".08" />
      <circle cx="60" cy="54" r="40" fill={L} opacity=".55" />
      <g className="empty-float">{body[kind]}</g>
    </svg>
  );
}

/** Quan no hi ha res per mostrar: un dibuixet, el missatge i (si cal) una pista. */
export function Empty({ art, title, hint, compact = false, children }: { art: EmptyArt; title: ReactNode; hint?: ReactNode; compact?: boolean; children?: ReactNode }) {
  return (
    <div className={`empty${compact ? " compact" : ""}`}>
      <Art kind={art} />
      <div>
        <p className="empty-title">{title}</p>
        {hint && <p className="empty-hint">{hint}</p>}
        {children}
      </div>
    </div>
  );
}
