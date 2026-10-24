// Dades de la FCF amb pla B. Des d'octubre de 2026 la FCF no deixa consultar el seu servei de dades
// (/api/...) des de fora de la seva web, però les pàgines de les actes sí que s'obren.
// Per això: 1) si la consulta funciona, es guarda una còpia; 2) si no, es fa servir l'última còpia
// (o la que porta l'app); 3) els partits ja jugats que la còpia encara no té es completen llegint l'acta.
// Només per al servidor (rutes /api).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGroupMatches, type FcfMatch, type GroupMatch } from "@/lib/fcf";
import { fetchActaFull, fetchScorers, fetchSanctions, type ActaFull, type Scorer, type Sanction } from "@/lib/fcf-bigdata";
import snapshot from "@/lib/fcf-snapshot.json";

/** Si les dades no són d'ara: de quan són (ISO). */
export type Freshness = { stale_at: string | null };
export const fresh = (): Freshness => ({ stale_at: null });

const SNAP = snapshot as { grup_id: string; at: string; matches: GroupMatch[]; scorers: Scorer[]; sanctions: Sanction[] };

async function readCache<T>(db: SupabaseClient, key: string): Promise<{ data: T; at: string } | null> {
  const { data, error } = await db.from("fcf_cache").select("data, fetched_at").eq("key", key).maybeSingle();
  if (error || !data) return null; // (si la taula encara no existeix, també)
  return { data: data.data as T, at: data.fetched_at as string };
}
async function writeCache(db: SupabaseClient, key: string, value: unknown) {
  await db.from("fcf_cache").upsert({ key, data: value, fetched_at: new Date().toISOString() }).then(() => {}, () => {});
}

/** Prova la FCF; si falla, l'última còpia guardada; si no n'hi ha, la que porta l'app. */
export async function cached<T>(db: SupabaseClient, key: string, live: () => Promise<T>, f: Freshness, builtIn?: T | null): Promise<T> {
  try {
    const v = await live();
    await writeCache(db, key, v);
    return v;
  } catch (e) {
    const c = await readCache<T>(db, key);
    if (c) {
      f.stale_at = older(f.stale_at, c.at);
      return c.data;
    }
    if (builtIn != null) {
      f.stale_at = older(f.stale_at, SNAP.at);
      return builtIn;
    }
    throw e;
  }
}
const older = (a: string | null, b: string) => (a && a < b ? a : b);

/** Clau d'un equip per comparar noms («BREDA, U.E. A» = «Breda»). */
export const rivalKey = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/,?\s+(c\.e\.|u\.e\.|c\.f\.|a\.d\.|c\.d\.|u\.d\.|f\.c\.)\s*/g, " ")
    .replace(/\s+[a-z]$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/** A l'acta els equips no porten la lletra («BREDA, U.E.» i no «BREDA, U.E. A»). */
function sideOf(m: GroupMatch, team: string): "home" | "away" | null {
  const k = rivalKey(team), hk = rivalKey(m.home), ak = rivalKey(m.away);
  if (k === hk || hk.startsWith(k) || k.startsWith(hk)) return "home";
  if (k === ak || ak.startsWith(k) || k.startsWith(ak)) return "away";
  return null;
}

/** Resultat a partir de l'acta (els gols en pròpia compten per a l'altre equip). Null si l'acta encara no és completa. */
export function scoreFromActa(m: GroupMatch, a: ActaFull): { home: number; away: number } | null {
  const sides = new Set(a.players.map((p) => sideOf(m, p.team)));
  if (a.players.length < 14 || !sides.has("home") || !sides.has("away")) return null;
  let home = 0, away = 0;
  for (const g of a.goals) {
    const s = sideOf(m, g.team);
    if (!s) continue;
    const forHome = g.kind === "GOL EN PRÒPIA" ? s === "away" : s === "home";
    if (forHome) home++;
    else away++;
  }
  return { home, away };
}

const PLAYED_AFTER_MS = 3 * 3600 * 1000; // l'acta es mira 3 h després de començar el partit

/**
 * Partits del grup. Si les dades no són d'ara, els partits que ja s'haurien d'haver jugat es completen
 * amb l'acta (primer la guardada; si no, se'n llegeixen com a molt `maxReads` de noves, de 4 en 4).
 */
export async function groupMatches(db: SupabaseClient, grup: string, f: Freshness, maxReads = 12): Promise<GroupMatch[]> {
  const list = await cached(db, `group-matches:${grup}`, () => fetchGroupMatches(grup), f, SNAP.grup_id === grup ? SNAP.matches : null);
  if (!f.stale_at) return list;
  const due = list.filter((m) => !m.closed && m.kickoff && Date.parse(`${m.kickoff}+02:00`) + PLAYED_AFTER_MS < Date.now());
  if (!due.length) return list;
  const saved = new Map<string, ActaFull>();
  const { data } = await db.from("fcf_league_actas").select("acta_id, data").in("acta_id", due.map((m) => m.acta_id));
  for (const r of data ?? []) saved.set(r.acta_id as string, r.data as ActaFull);
  const toRead = due.filter((m) => !saved.has(m.acta_id)).slice(0, maxReads);
  for (let i = 0; i < toRead.length; i += 4) {
    const part = toRead.slice(i, i + 4);
    const got = await Promise.allSettled(part.map((m) => fetchActaFull(m.acta_id)));
    const rows = got.flatMap((g, k) => (g.status === "fulfilled" && scoreFromActa(part[k], g.value) ? [{ acta_id: part[k].acta_id, grup_id: grup, jornada: part[k].jornada, data: g.value }] : []));
    for (const r of rows) saved.set(r.acta_id, r.data);
    if (rows.length) await db.from("fcf_league_actas").upsert(rows).then(() => {}, () => {});
  }
  return list.map((m) => {
    const a = saved.get(m.acta_id);
    const s = a && !m.closed ? scoreFromActa(m, a) : null;
    return s ? { ...m, home_goals: s.home, away_goals: s.away, closed: true } : m;
  });
}

/** Els partits del nostre equip, a partir dels del grup. */
export function teamMatchesOf(all: GroupMatch[], teamId: string): FcfMatch[] {
  return all
    .filter((m) => m.home_id === teamId || m.away_id === teamId)
    .map((m) => ({ acta_id: m.acta_id, jornada: m.jornada, kickoff: m.kickoff, home: m.home, away: m.away, home_goals: m.home_goals, away_goals: m.away_goals, is_home: m.home_id === teamId, closed: m.closed }))
    .sort((a, b) => a.jornada - b.jornada);
}

export const scorersCached = (db: SupabaseClient, grup: string, f: Freshness) =>
  cached(db, `scorers:${grup}`, async () => {
    const l = await fetchScorers(grup);
    if (!l.length) throw new Error("FCF: sense golejadores");
    return l;
  }, f, SNAP.grup_id === grup ? SNAP.scorers : []);

export const sanctionsCached = (db: SupabaseClient, grup: string, f: Freshness) =>
  cached(db, `sanctions:${grup}`, async () => {
    const l = await fetchSanctions(grup);
    if (!l.length) throw new Error("FCF: sense sancions");
    return l;
  }, f, SNAP.grup_id === grup ? SNAP.sanctions : []);
