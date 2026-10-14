"use client";

import { useEffect, useState } from "react";
import { rivalKey } from "@/lib/analysis";

// Escuts dels equips (de la FCF). Es demanen un sol cop per pàgina.
type Team = { id: string; name: string; crest: string };
let teamsPromise: Promise<Team[]> | null = null;
let teamsCache: Team[] | null = null;

function loadTeams(): Promise<Team[]> {
  teamsPromise ??= fetch("/api/fcf/crests")
    .then((r) => (r.ok ? r.json() : { teams: [] }))
    .then((j: { teams?: Team[] }) => (teamsCache = j.teams ?? []))
    .catch(() => (teamsCache = []));
  return teamsPromise;
}

const isUs = (name: string) => /\beuropa\b/.test(rivalKey(name));

/** Troba l'escut d'un equip pel nom (encara que estigui escrit una mica diferent). */
export function crestFor(teams: Team[], name: string | null | undefined): string | null {
  if (!name) return null;
  if (isUs(name)) return "/escut.png";
  const k = rivalKey(name);
  if (!k) return null;
  const keyed = teams.map((t) => ({ t, k: rivalKey(t.name) }));
  const exact = keyed.find((x) => x.k === k);
  if (exact) return exact.t.crest;
  const part = keyed.find((x) => x.k.startsWith(k) || k.startsWith(x.k) || x.k.includes(k) || k.includes(x.k));
  if (part) return part.t.crest;
  // Per paraules (p. ex. «Premià Dalt» ↔ «PREMIA DALT, C.D.»): la que més en comparteix.
  const words = new Set(k.split(" ").filter((w) => w.length > 2));
  let best: { t: Team; n: number } | null = null;
  for (const x of keyed) {
    const n = x.k.split(" ").filter((w) => words.has(w)).length;
    if (n > 0 && (!best || n > best.n)) best = { t: x.t, n };
  }
  return best?.t.crest ?? null;
}

/** Llista d'equips amb escut (es carrega en segon pla). */
export function useCrests(): Team[] {
  const [teams, setTeams] = useState<Team[]>(() => teamsCache ?? []);
  useEffect(() => {
    if (teamsCache) return;
    let alive = true;
    loadTeams().then((t) => alive && setTeams(t));
    return () => {
      alive = false;
    };
  }, []);
  return teams;
}

const initials = (name: string) =>
  rivalKey(name)
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Escut d'un equip. Si no el trobem, un cercle amb les inicials. */
export function Crest({ name, size = 28, className = "" }: { name: string | null | undefined; size?: number; className?: string }) {
  const teams = useCrests();
  const [broken, setBroken] = useState<string | null>(null);
  const src = crestFor(teams, name);
  const style = { width: size, height: size };
  if (!src || broken === src) {
    return (
      <span className={`crest crest-fallback ${className}`} style={{ ...style, fontSize: Math.max(9, size * 0.36) }} aria-hidden="true">
        {initials(name ?? "")}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`crest ${className}`} src={src} alt="" width={size} height={size} style={style} loading="lazy" decoding="async" onError={() => setBroken(src)} />
  );
}

/** «Equip A – Equip B» amb els dos escuts. */
export function MatchLine({ home, away, score, size = 22, className = "" }: { home: string; away: string; score?: string; size?: number; className?: string }) {
  return (
    <span className={`match-line ${className}`}>
      <span className="ml-team"><Crest name={home} size={size} /><span>{home}</span></span>
      <span className="ml-score">{score ?? "–"}</span>
      <span className="ml-team away"><span>{away}</span><Crest name={away} size={size} /></span>
    </span>
  );
}
