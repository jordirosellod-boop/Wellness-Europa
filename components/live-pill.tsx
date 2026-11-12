"use client";

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

/** Torna a l'inici sense tornar a ensenyar l'entrada (i conservant l'enllaç personal de la jugadora). */
function toHome(e: { preventDefault: () => void; currentTarget: HTMLAnchorElement }) {
  e.preventDefault();
  try { sessionStorage.setItem("skip-splash", "1"); } catch { /* res */ }
  window.location.assign(e.currentTarget.getAttribute("href") + window.location.hash);
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
  const [meeting, setMeeting] = useState<{ d: string; t: string; dur: number } | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const read = () => {
      try {
        const x = JSON.parse(localStorage.getItem("splash-match") || "null") as Saved | null;
        setM(x && x.d === todayMadrid() && x.t ? x : null);
        const r = JSON.parse(localStorage.getItem("next-meeting") || "null") as { d: string; t: string; dur: number } | null;
        setMeeting(r && r.d === todayMadrid() ? r : null);
      } catch { setM(null); setMeeting(null); }
      setNow(Date.now());
      setSection(new URLSearchParams(window.location.search).get("s"));
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  // A l'inici ja hi ha la targeta gran; a l'entrada i a l'anàlisi (gravació) no cal.
  // (l'app de les jugadores és tota a /j: l'inici és quan no hi ha cap apartat obert)
  if (path === "/" || (path === "/j" && !section) || path === "/entrenador" || path.startsWith("/entrenador/analisi")) return null;
  // La reunió individual (jugadora): des de 3 h abans fins que s'acaba
  if (meeting && path.startsWith("/j")) {
    const st = madridEpoch(meeting.d, meeting.t), en = st + meeting.dur * 60_000;
    if (now >= st - 3 * 3600_000 && now < en && !(m && now > madridEpoch(m.d, m.m || m.t) - 3 * 3600_000)) {
      const left = Math.ceil((st - now) / 60_000);
      return (
        <a href="/j" className="live-pill lp-meet" aria-label="La teva reunió: anar a l'inici" onClick={toHome}>
          <span aria-hidden="true">🗣️</span><b>Reunió</b>
          <span className="lp-clock">{now >= st ? "ara" : left >= 60 ? `d'aquí ${Math.floor(left / 60)} h ${left % 60} min` : `d'aquí ${left} min`}</span>
          <span className="lp-vs">{meeting.t} h</span>
        </a>
      );
    }
  }
  if (!m) return null;
  const ko = madridEpoch(m.d, m.t);
  const meet = m.m ? madridEpoch(m.d, m.m) : null;
  const end = ko + MATCH_MIN * 60_000;
  if (now > end + 3 * 3600_000) return null;
  const rival = (m.r || "Rival").replace(/^(C\.?F\.?|U\.?E\.?|C\.?E\.?|F\.?C\.?)\s+/i, "");
  const phase = now < (meet ?? ko) ? "abans" : now < ko ? "quedada" : now < end ? "joc" : "final";
  const home = path.startsWith("/entrenador") ? "/entrenador" : "/j";
  return (
    <a href={home} className={`live-pill lp-${phase}`} aria-label="Dia de partit: anar a l'inici" onClick={toHome}>
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
    </a>
  );
}
