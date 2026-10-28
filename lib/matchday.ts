// Dia de partit: compte enrere fins a la quedada i el resultat quan s'acaba.

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
