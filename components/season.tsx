"use client";

import { useEffect, useState } from "react";
import { Confetti } from "@/components/matchday";

type Season = { key: string; label: string; fx: "snow" | "petals" | "leaves" | "confetti" };

/** Detalls de temporada segons el dia (AAAA-MM-DD, hora de Barcelona). */
export function seasonOf(today: string): Season | null {
  const md = today.slice(5);
  if (md === "01-01") return { key: "anynou", label: "Bon any nou! 🎆", fx: "snow" };
  if (md >= "12-15" || md <= "01-06") return { key: "nadal", label: "Bones festes! 🎄", fx: "snow" };
  if (md === "04-23") return { key: "santjordi", label: "Feliç Sant Jordi! 🌹", fx: "petals" };
  if (md === "10-31" || md === "11-01") return { key: "castanyada", label: "Bona Castanyada! 🌰", fx: "leaves" };
  if (md >= "06-15" && md <= "07-15") return { key: "final", label: "Gràcies per la temporada! 💙", fx: "confetti" };
  return null;
}

/** Dins la salutació: el missatge del dia i una mica d'ambient (neu, pètals, fulles o confeti un sol cop). */
export function SeasonFx({ today }: { today: string }) {
  const s = seasonOf(today);
  const [party, setParty] = useState(false);
  useEffect(() => {
    if (s?.fx !== "confetti") return;
    const key = `temporada:${today.slice(0, 4)}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch { /* sense emmagatzematge: no passa res */ }
    const t = setTimeout(() => setParty(true), 600);
    return () => clearTimeout(t);
  }, [s?.fx, today]);
  if (!s) return null;
  const n = s.fx === "confetti" ? 0 : 14;
  return (
    <>
      {party && <Confetti onDone={() => setParty(false)} />}
      {n > 0 && (
        <span className={`season-fx ${s.fx}`} aria-hidden="true">
          {Array.from({ length: n }, (_, i) => <i key={i} />)}
        </span>
      )}
      <span className="season-label">{s.label}</span>
    </>
  );
}
