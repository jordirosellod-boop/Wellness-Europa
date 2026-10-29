// Dia de partit: compte enrere fins a la quedada i el resultat quan s'acaba.

import { firstName } from "@/lib/first-name";
import { fetchAvatars } from "@/lib/player-photos";
import { addDays } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { TZ } from "@/lib/wellness";

/** Mil·lisegons (epoch) d'una data i hora de Barcelona («2026-10-29», «10:00:00»). */
export function madridEpoch(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Quina hora marca Barcelona en aquell instant? La diferència és el desfasament (1 o 2 h).
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(guess)).map((x) => [x.type, x.value]),
  );
  const shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return guess - (shown - guess);
}

export type Phase = "abans" | "quedada" | "joc" | "final";

/** En quin moment del dia de partit som. Sense hora: tot el dia és «abans». */
export function phaseOf(now: number, meet: number | null, kickoff: number | null): Phase {
  if (kickoff != null && now >= kickoff + 105 * 60_000) return "final";
  if (kickoff != null && now >= kickoff) return "joc";
  if (meet != null && now >= meet) return "quedada";
  return "abans";
}

/** «2 h 05 min 09 s» → en peces per pintar-les. */
export function split(ms: number): { h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

export type FcfResult = { acta_id: string; kickoff: string | null; home: string; away: string; home_goals: number; away_goals: number; is_home: boolean };

/** L'últim resultat oficial dels darrers dies (per celebrar-lo a l'inici). */
export async function recentResult(today: string, days = 2): Promise<FcfResult | null> {
  const { data, error } = await supabase().from("fcf_matches")
    .select("acta_id, kickoff, home, away, home_goals, away_goals, is_home")
    .gte("kickoff", addDays(today, -days)).lt("kickoff", addDays(today, 1))
    .not("home_goals", "is", null).not("away_goals", "is", null)
    .order("kickoff", { ascending: false }).order("acta_id").range(0, 0);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FcfResult[])[0] ?? null;
}

export function outcome(r: Pick<FcfResult, "home_goals" | "away_goals" | "is_home">): "G" | "E" | "P" {
  const us = r.is_home ? r.home_goals : r.away_goals;
  const them = r.is_home ? r.away_goals : r.home_goals;
  return us > them ? "G" : us === them ? "E" : "P";
}

export type Scorer = { name: string; goals: number; avatar: string | null };

/** Les nostres golejadores d'un partit (de l'acta oficial), amb el nom de l'app i l'avatar si en tenen. */
export async function fetchScorers(actaId: string): Promise<Scorer[]> {
  const sb = supabase();
  const { data: apps, error } = await sb.from("fcf_appearances").select("fcf_id, goals").eq("acta_id", actaId).gt("goals", 0).order("fcf_id").range(0, 49);
  if (error) throw new Error(error.message);
  const rows = (apps ?? []) as { fcf_id: string; goals: number }[];
  if (!rows.length) return [];
  const [fcf, roster, avatars] = await Promise.all([
    sb.from("fcf_players").select("fcf_id, full_name, profile_id").in("fcf_id", rows.map((r) => r.fcf_id)).order("fcf_id").range(0, 49),
    sb.rpc("team_roster").range(0, 199),
    fetchAvatars().catch(() => new Map<string, string>()),
  ]);
  const who = new Map(((fcf.data ?? []) as { fcf_id: string; full_name: string; profile_id: string | null }[]).map((p) => [p.fcf_id, p]));
  const names = new Map(((roster.data ?? []) as { player_id: string; display_name: string }[]).map((r) => [r.player_id, r.display_name]));
  // A la FCF: «COGNOMS, NOM» → «Nom»
  const given = (full: string) => (full.split(",")[1] ?? full).trim().split(/\s+/)[0].toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
  return rows
    .map((r) => {
      const p = who.get(r.fcf_id);
      const app = p?.profile_id ? names.get(p.profile_id) : undefined;
      return { name: app ? firstName(app) : p ? given(p.full_name) : "?", goals: r.goals, avatar: p?.profile_id ? avatars.get(p.profile_id) ?? null : null };
    })
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, "ca"));
}

export type OurMatch = { day: string; rival: string; us: number | null; them: number | null };
let oursCache: Promise<Map<string, OurMatch>> | null = null;

/** Els nostres partits de lliga (de la FCF), per dia: el rival i, si ja s'ha jugat, el resultat. */
export function fetchOurMatches(): Promise<Map<string, OurMatch>> {
  oursCache ??= (async () => {
    const { data, error } = await supabase().from("fcf_matches")
      .select("acta_id, kickoff, home, away, home_goals, away_goals, is_home").not("kickoff", "is", null)
      .order("kickoff").order("acta_id").range(0, 199);
    if (error) throw new Error(error.message);
    const m = new Map<string, OurMatch>();
    for (const r of (data ?? []) as (FcfResult & { home_goals: number | null; away_goals: number | null })[]) {
      const day = r.kickoff!.slice(0, 10);
      const us = r.is_home ? r.home_goals : r.away_goals, them = r.is_home ? r.away_goals : r.home_goals;
      m.set(day, { day, rival: r.is_home ? r.away : r.home, us, them });
    }
    return m;
  })().catch((e) => { oursCache = null; throw e; });
  return oursCache;
}
