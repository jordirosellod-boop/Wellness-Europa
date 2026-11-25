// «La teva temporada»: el resum de tota la temporada de la jugadora (només les seves dades), com «El teu mes» però de l'any.

import { fetchAttendance, fetchSessionsBetween } from "@/lib/attendance";
import { addDays } from "@/lib/dates";
import { monthName } from "@/lib/month-wrap";
import { fetchWinners } from "@/lib/mvp";
import { fetchAll, supabase } from "@/lib/supabase";

export type SeasonWrap = {
  season: string; // «2026/27»
  trainings: { present: number; marked: number };
  wellness: { count: number; avg: number | null; best: number };
  matches: { played: number; minutes: number; goals: number; starts: number };
  mvps: number;
  bestMonth: { name: string; pct: number } | null;
};

export const seasonStartOf = (today: string) => {
  const y = Number(today.slice(0, 4));
  return `${Number(today.slice(5, 7)) >= 8 ? y : y - 1}-08-01`;
};
export const seasonLabel = (today: string) => { const y = Number(seasonStartOf(today).slice(0, 4)); return `${y}/${String(y + 1).slice(2)}`; };

export async function fetchSeasonWrap(meId: string, today: string): Promise<SeasonWrap> {
  const sb = supabase();
  const from = seasonStartOf(today);
  const to = addDays(from, 364) < today ? addDays(from, 364) : today;
  const sessions = (await fetchSessionsBetween(from, to)).filter((s) => !s.cancelled)
    .sort((a, b) => (a.session_date + (a.start_time ?? "")).localeCompare(b.session_date + (b.start_time ?? "")));
  const ids = sessions.map((s) => s.id);
  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
  const [att, well, fcf, mins, winners] = await Promise.all([
    fetchAttendance(ids, meId),
    Promise.all(chunks.map((c) => fetchAll<{ session_id: string; score: number }>((f, t) =>
      sb.from("wellness").select("session_id, score").eq("player_id", meId).in("session_id", c).order("id").range(f, t)))).then((x) => x.flat()),
    sb.from("fcf_players").select("fcf_id, goals, starts").eq("profile_id", meId).maybeSingle(),
    fetchAll<{ minutes: number; started: boolean }>((f, t) => sb.from("match_minutes").select("minutes, started").eq("player_id", meId).order("convocation_id").range(f, t)).catch(() => []),
    fetchWinners().catch(() => []),
  ]);
  const trainingIds = new Set(sessions.filter((s) => s.kind === "Entrenament").map((s) => s.id));
  const mine = att.filter((a) => a.player_id === meId && trainingIds.has(a.session_id));
  const absent = new Set(att.filter((a) => a.player_id === meId && !a.present).map((a) => a.session_id));
  const filled = new Set(well.map((w) => w.session_id));
  let best = 0, run = 0;
  for (const s of sessions) {
    if (filled.has(s.id)) best = Math.max(best, ++run);
    else if (!absent.has(s.id) && s.session_date < today) run = 0;
  }
  // Millor mes: el de més percentatge d'entrenaments (amb un mínim de 4)
  const dayOf = new Map(sessions.map((s) => [s.id, s.session_date]));
  const byMonth = new Map<string, { p: number; n: number }>();
  for (const a of mine) { const m = (dayOf.get(a.session_id) ?? "").slice(0, 7); if (!m) continue; const x = byMonth.get(m) ?? { p: 0, n: 0 }; x.n++; if (a.present) x.p++; byMonth.set(m, x); }
  const bm = [...byMonth.entries()].filter(([, x]) => x.n >= 4).sort((a, b) => b[1].p / b[1].n - a[1].p / a[1].n || b[1].n - a[1].n)[0];
  const f = fcf.data as { fcf_id: string; goals: number; starts: number } | null;
  return {
    season: seasonLabel(today),
    trainings: { present: mine.filter((a) => a.present).length, marked: mine.length },
    wellness: { count: well.length, avg: well.length ? well.reduce((a, w) => a + Number(w.score), 0) / well.length : null, best },
    matches: { played: mins.filter((m) => m.minutes > 0).length, minutes: mins.reduce((a, m) => a + m.minutes, 0), goals: f?.goals ?? 0, starts: Math.max(f?.starts ?? 0, mins.filter((m) => m.started).length) },
    mvps: winners.filter((w) => w.player_id === meId).length,
    bestMonth: bm ? { name: monthName(`${bm[0]}-01`), pct: Math.round((bm[1].p / bm[1].n) * 100) } : null,
  };
}
