"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { madridEpoch } from "@/lib/matchday";
import { todayMadrid } from "@/lib/wellness";

type Saved = { d: string; t: string; m?: string; h: boolean; c: string; r?: string };
const MATCH_MIN = 105; // durada aproximada (dues parts i el descans)

const pad = (n: number) => String(n).padStart(2, "0");
function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Minut aproximat (2 × 45 amb 15 de descans). */
function minute(ms: number): string {
  const e = Math.floor(ms / 60_000);
  if (e < 47) return `${e + 1}'`;
  if (e < 62) return "Descans";
  return `${Math.min(90, e - 15 + 1)}'`;
}

/**
 * El dia de partit, a dalt de qualsevol pantalla: una píndola amb l'escut del rival i el compte enrere,
 * «EN JOC» durant el partit i «FINAL» després. Si es toca, porta a l'inici (on hi ha tota la informació).
 */
export function LivePill() {
  const path = usePathname();
  const [m, setM] = useState<Saved | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const read = () => {
      try {
        const x = JSON.parse(localStorage.getItem("splash-match") || "null") as Saved | null;
        setM(x && x.d === todayMadrid() && x.t ? x : null);
      } catch { setM(null); }
      setNow(Date.now());
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, []);
  if (!m || !now) return null;
  // A l'inici ja hi ha la targeta gran del partit; a l'entrada i a l'anàlisi (gravació) no cal.
  if (path === "/" || path === "/j" || path === "/entrenador" || path.startsWith("/entrenador/analisi")) return null;
  const ko = madridEpoch(m.d, m.t);
  const meet = m.m ? madridEpoch(m.d, m.m) : null;
  const end = ko + MATCH_MIN * 60_000;
  if (now > end + 3 * 3600_000) return null;
  const rival = (m.r || "Rival").replace(/^(C\.?F\.?|U\.?E\.?|C\.?E\.?|F\.?C\.?)\s+/i, "");
  const phase = now < (meet ?? ko) ? "abans" : now < ko ? "quedada" : now < end ? "joc" : "final";
  const home = path.startsWith("/entrenador") ? "/entrenador" : "/j";
  return (
    <Link href={home} className={`live-pill lp-${phase}`} aria-label="Dia de partit: anar a l'inici">
      {phase === "joc" ? <span className="lp-dot" aria-hidden="true" /> : <span aria-hidden="true">⚽</span>}
      <b>{phase === "abans" ? (meet ? "Quedada" : "Partit") : phase === "quedada" ? "Comença" : phase === "joc" ? "EN JOC" : "FINAL"}</b>
      {(phase === "abans" || phase === "quedada") && <span className="lp-clock">{clock((phase === "abans" ? meet ?? ko : ko) - now)}</span>}
      {phase === "joc" && <span className="lp-clock">{minute(now - ko)}</span>}
      <span className="lp-vs">vs</span>
      {m.c && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.c} alt="" width={20} height={20} />
      )}
      <span className="lp-rival">{rival}</span>
    </Link>
  );
}
