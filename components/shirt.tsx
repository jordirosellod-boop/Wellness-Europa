"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Dorsals de l'equip (una sola consulta per a tota l'app; es comparteix entre components).
let cache: Promise<Map<string, number | null>> | null = null;
export function fetchDorsals(): Promise<Map<string, number | null>> {
  cache ??= (async () => {
    const { data, error } = await supabase().rpc("team_dorsals");
    if (error) throw new Error(error.message);
    return new Map(((data ?? []) as { player_id: string; dorsal: number | null }[]).map((r) => [r.player_id, r.dorsal]));
  })().catch((e) => {
    cache = null; // el proper intent ho torna a provar
    throw e;
  });
  return cache;
}

export function useDorsals(): Map<string, number | null> {
  const [m, setM] = useState<Map<string, number | null>>(new Map());
  useEffect(() => {
    let alive = true;
    fetchDorsals().then((x) => alive && setM(x), () => {});
    return () => { alive = false; };
  }, []);
  return m;
}

/** Samarreta petita del CE Europa amb el dorsal, al costat del nom (en lloc d'una foto). */
export function Shirt({ n, size = 30, tone = "home", className = "" }: { n: number | null | undefined; size?: number; tone?: "home" | "gold"; className?: string }) {
  const label = n == null ? "Sense dorsal" : `Dorsal ${n}`;
  return (
    <svg className={`shirt-ico ${tone} ${className}`} width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={label}>
      <path className="sh-body" d="M13 4 L8 6 L2 12 L6 18 L10 16 L10 37 L30 37 L30 16 L34 18 L38 12 L32 6 L27 4 Q20 9 13 4 Z" />
      <path className="sh-v" d="M13 4 Q20 9 27 4 L25.5 6.5 Q20 13 14.5 6.5 Z" />
      <path className="sh-sleeve" d="M2 12 L6 18 L8.2 17 L4.4 10.6 Z M38 12 L34 18 L31.8 17 L35.6 10.6 Z" />
      <text x="20" y="30" textAnchor="middle">{n == null ? "" : n}</text>
    </svg>
  );
}
