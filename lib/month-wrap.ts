// «El teu mes»: el resum d'un mes de la jugadora (només les seves dades).

import { fetchAttendance, fetchSessionsBetween } from "@/lib/attendance";
import { fetchConvocations, fetchRoster } from "@/lib/convo";
import { addDays, addMonths, startOfMonth } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";

export type MonthWrap = {
  month: string;
  name: string;            // «octubre»
  next: string;            // «novembre»
  trainings: { present: number; marked: number };
  wellness: { count: number; avg: number | null; best: number };
  effort: { minutes: number; avgRpe: number | null };
  matches: { called: number; played: number; goals: number; convos: number };
  league: { rank: number | null; of: number; points: number; trainings: number; min: number } | null;
};

export const monthName = (d: string) =>
  new Intl.DateTimeFormat("ca-ES", { month: "long", timeZone: "UTC" }).format(new Date(`${startOfMonth(d)}T12:00:00Z`));

/** «d'octubre» / «de novembre» */
export const ofMonth = (d: string) => {
  const n = monthName(d);
  return /^[aeiouàèéíòóú]/i.test(n) ? `d'${n}` : `de ${n}`;
};

export async function fetchMonthWrap(meId: string, anyDay: string, today: string): Promise<MonthWrap> {
  const sb = supabase();
  const from = startOfMonth(anyDay);
  const end = addDays(addMonths(from, 1), -1);
  const to = end < today ? end : today;
  const sessions = (await fetchSessionsBetween(from, to)).sort((a, b) => (a.session_date + (a.start_time ?? "")).localeCompare(b.session_date + (b.start_time ?? "")));
  const ids = sessions.map((s) => s.id);
  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
  const [att, well, rpe, fcf, convos, league] = await Promise.all([
    fetchAttendance(ids, meId),
    Promise.all(chunks.map((c) => fetchAll<{ session_id: string; score: number }>((f, t) =>
      sb.from("wellness").select("session_id, score").eq("player_id", meId).in("session_id", c).order("id").range(f, t)))).then((x) => x.flat()),
    Promise.all(chunks.map((c) => fetchAll<{ session_id: string; rpe: number; duration_min: number | null }>((f, t) =>
      sb.from("rpe").select("session_id, rpe, duration_min").eq("player_id", meId).in("session_id", c).order("id").range(f, t)))).then((x) => x.flat()),
    sb.from("fcf_players").select("fcf_id").eq("profile_id", meId).maybeSingle(),
    fetchConvocations(from).then((l) => l.filter((c) => c.match_date <= to)).catch(() => []),
    sb.rpc("league_table", { m: from }),
  ]);

  const trainingIds = new Set(sessions.filter((s) => s.kind === "Entrenament").map((s) => s.id));
  const mineAtt = att.filter((a) => a.player_id === meId && trainingIds.has(a.session_id));
  const absent = new Set(att.filter((a) => a.player_id === meId && !a.present).map((a) => a.session_id));
  const filled = new Set(well.map((w) => w.session_id));
  // Millor ratxa del mes: sessions seguides amb wellness (les absències no la trenquen).
  let best = 0, run = 0;
  for (const s of sessions) {
    if (filled.has(s.id)) best = Math.max(best, ++run);
    else if (!absent.has(s.id) && s.session_date < today) run = 0;
  }

  // Partits: convocatòries d'aquest mes i, de la FCF, partits jugats i gols.
  let called = 0;
  for (const c of convos) {
    const row = (await fetchRoster(c.id).catch(() => [])).find((r) => r.player_id === meId);
    if (row?.called) called++;
  }
  let played = 0, goals = 0;
  const fcfId = (fcf.data as { fcf_id: string } | null)?.fcf_id;
  if (fcfId) {
    const apps = await fetchAll<{ acta_id: string; goals: number }>((f, t) =>
      sb.from("fcf_appearances").select("acta_id, goals").eq("fcf_id", fcfId).order("acta_id").range(f, t));
    if (apps.length) {
      const ms = await fetchAll<{ acta_id: string }>((f, t) =>
        sb.from("fcf_matches").select("acta_id").in("acta_id", apps.map((a) => a.acta_id)).gte("kickoff", from).lt("kickoff", addMonths(from, 1)).order("acta_id").range(f, t));
      const inMonth = new Set(ms.map((m) => m.acta_id));
      for (const a of apps) if (inMonth.has(a.acta_id)) { played++; goals += a.goals; }
    }
  }

  const rows = (league.data ?? []) as { profile_id: string; points: number; trainings: number; rank: number | null; qualified: boolean; min_trainings: number }[];
  const me = rows.find((r) => r.profile_id === meId);
  const minutes = rpe.reduce((a, r) => a + (r.duration_min ?? 0), 0);
  return {
    month: from,
    name: monthName(from),
    next: monthName(addMonths(from, 1)),
    trainings: { present: mineAtt.filter((a) => a.present).length, marked: mineAtt.length },
    wellness: { count: well.length, avg: well.length ? well.reduce((a, w) => a + Number(w.score), 0) / well.length : null, best },
    effort: { minutes, avgRpe: rpe.length ? rpe.reduce((a, r) => a + r.rpe, 0) / rpe.length : null },
    matches: { called, played, goals, convos: convos.length },
    league: me ? { rank: me.qualified ? me.rank : null, of: rows.filter((r) => r.qualified).length, points: me.points, trainings: me.trainings, min: me.min_trainings } : null,
  };
}
