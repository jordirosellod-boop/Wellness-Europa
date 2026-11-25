// Fitxa 360° d'una jugadora (només staff): tot el que l'app sap d'ella en un sol lloc.
// `loadPlayer360` llegeix les dades; `watchList` (pura) escriu el «Què vigilar».

import { MIN_DAYS } from "@/lib/acwr";
import { loadTeamAcwr } from "@/lib/acwr-data";
import { fetchAttendance, fetchSessionsBetween } from "@/lib/attendance";
import { fetchBibPlayers } from "@/lib/bibs";
import { addDays } from "@/lib/dates";
import { fetchWinners } from "@/lib/mvp";
import { readinessOf, type Readiness, type WellRow } from "@/lib/readiness";
import { seasonStartOf } from "@/lib/season-wrap";
import { fetchAll, supabase } from "@/lib/supabase";

export type DayWell = { date: string; score: number; sleep: number; fatigue: number; mood: number; pain: boolean };
export type Player360 = {
  id: string; name: string; dorsal: number | null;
  readiness: Readiness;
  well: DayWell[];                    // últims 30 dies (un per dia)
  teamAvg: Map<string, number>;       // mitjana de l'equip per dia (wellness)
  missingWell7: number;               // sessions dels últims 7 dies sense wellness
  load: { acwr: number | null; week: number; reliable: boolean } | null;
  season: { present: number; marked: number; recent: (boolean | null)[]; minutes: number; played: number; starts: number; goals: number; mvps: number };
  injuries: { start: string; end: string | null; note: string | null }[];
  meetings: { day: string; time: string; done: boolean; title: string }[];
};

const dateOf = (s: { session_date: string } | { session_date: string }[] | null) => (Array.isArray(s) ? s[0]?.session_date : s?.session_date) ?? "";

export async function loadPlayer360(id: string, today: string): Promise<Player360> {
  const sb = supabase();
  const from30 = addDays(today, -30);
  const season0 = seasonStartOf(today);
  const [prof, myWell, teamWell, injuries, sessionsSeason, mins, fcf, winners, slots, todaySessions, bib] = await Promise.all([
    sb.from("profiles").select("id, display_name, created_at").eq("id", id).maybeSingle(),
    fetchAll<{ score: number; sleep: number; fatigue: number; mood: number; has_pain: boolean; sessions: { session_date: string } | { session_date: string }[] }>((f, t) =>
      sb.from("wellness").select("score, sleep, fatigue, mood, has_pain, sessions!inner(session_date)").eq("player_id", id)
        .gte("sessions.session_date", from30).lte("sessions.session_date", today).order("id").range(f, t)),
    fetchAll<{ score: number; sessions: { session_date: string } | { session_date: string }[] }>((f, t) =>
      sb.from("wellness").select("score, sessions!inner(session_date)").gte("sessions.session_date", from30).lte("sessions.session_date", today).order("id").range(f, t)).catch(() => []),
    fetchAll<{ start_date: string; end_date: string | null; note: string | null }>((f, t) =>
      sb.from("injuries").select("start_date, end_date, note").eq("player_id", id).order("start_date", { ascending: false }).order("id").range(f, t)).catch(() => []),
    fetchSessionsBetween(season0, today).catch(() => []),
    fetchAll<{ minutes: number; started: boolean }>((f, t) => sb.from("match_minutes").select("minutes, started").eq("player_id", id).order("convocation_id").range(f, t)).catch(() => []),
    sb.from("fcf_players").select("goals, starts, matches").eq("profile_id", id).maybeSingle(),
    fetchWinners().catch(() => []),
    fetchAll<{ day: string; start_time: string; done: boolean; meeting_rounds: { title: string } | { title: string }[] | null }>((f, t) =>
      sb.from("meeting_slots").select("day, start_time, done, meeting_rounds(title)").eq("player_id", id).order("day").order("start_time").order("id").range(f, t)).catch(() => []),
    fetchAll<{ id: string }>((f, t) => sb.from("sessions").select("id").eq("session_date", today).eq("cancelled", false).order("id").range(f, t)).catch(() => []),
    fetchBibPlayers().catch(() => []),
  ]);
  if (!prof.data) throw new Error("No s'ha trobat aquesta jugadora.");
  const p = prof.data as { id: string; display_name: string; created_at: string };

  // Wellness: un punt per dia (el pitjor del dia, que és el que preocupa)
  const byDay = new Map<string, DayWell>();
  for (const w of myWell) {
    const d = dateOf(w.sessions);
    const cur = byDay.get(d);
    if (!cur || Number(w.score) < cur.score) byDay.set(d, { date: d, score: Number(w.score), sleep: w.sleep, fatigue: w.fatigue, mood: w.mood, pain: w.has_pain || !!cur?.pain });
  }
  const well = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const teamDays = new Map<string, number[]>();
  for (const w of teamWell) { const d = dateOf(w.sessions); teamDays.set(d, [...(teamDays.get(d) ?? []), Number(w.score)]); }
  const teamAvg = new Map([...teamDays.entries()].map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length]));

  // Assistència de la temporada i els últims entrenaments
  const trainings = sessionsSeason.filter((s) => s.kind === "Entrenament" && !s.cancelled && s.session_date <= today)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));
  const att = await fetchAttendance(trainings.map((s) => s.id), id).catch(() => []);
  const attOf = new Map(att.filter((a) => a.player_id === id).map((a) => [a.session_id, a.present]));
  const marked = trainings.filter((s) => attOf.has(s.id));
  const recent = trainings.slice(-8).map((s) => (attOf.has(s.id) ? attOf.get(s.id)! : null));

  // Wellness que falten (sessions dels últims 7 dies, sense comptar avui ni les absències)
  const last7 = sessionsSeason.filter((s) => !s.cancelled && s.session_date >= addDays(today, -7) && s.session_date < today);
  const missingWell7 = last7.filter((s) => attOf.get(s.id) !== false && !byDay.has(s.session_date)).length;

  // Càrrega, avisos d'absència d'avui i semàfor
  const acwrMap = await loadTeamAcwr(today, [{ id, created_at: p.created_at }]).catch(() => new Map());
  const a = acwrMap.get(id)?.result ?? null;
  const notices = todaySessions.length
    ? await fetchAll<{ player_id: string }>((f, t) => sb.from("absence_notices").select("player_id").eq("player_id", id).in("session_id", todaySessions.map((s) => s.id)).order("player_id").range(f, t)).catch(() => [])
    : [];
  const injuredNow = injuries.some((i) => i.start_date <= today && (!i.end_date || i.end_date >= today));
  const rows: WellRow[] = well.map((w) => ({ player_id: id, date: w.date, score: w.score, sleep: w.sleep, fatigue: w.fatigue, mood: w.mood, has_pain: w.pain }));
  const readiness = readinessOf({ injured: injuredNow, away: notices.length > 0, today: rows.find((r) => r.date === today) ?? null,
    history: rows.filter((r) => r.date >= addDays(today, -14)), acwr: a?.acwr ?? null, acwrReliable: !!a && a.days >= MIN_DAYS, date: today });

  const f = fcf.data as { goals: number; starts: number; matches: number } | null;
  return {
    id, name: p.display_name, dorsal: bib.find((b) => b.id === id)?.dorsal ?? null,
    readiness, well, teamAvg, missingWell7,
    load: a ? { acwr: a.acwr, week: a.week, reliable: a.days >= MIN_DAYS } : null,
    season: {
      present: marked.filter((s) => attOf.get(s.id)).length, marked: marked.length, recent,
      minutes: mins.reduce((n, m) => n + m.minutes, 0), played: Math.max(f?.matches ?? 0, mins.filter((m) => m.minutes > 0).length),
      starts: Math.max(f?.starts ?? 0, mins.filter((m) => m.started).length), goals: f?.goals ?? 0,
      mvps: winners.filter((w) => w.player_id === id).length,
    },
    injuries: injuries.map((i) => ({ start: i.start_date, end: i.end_date, note: i.note })),
    meetings: slots.map((s) => ({ day: s.day, time: s.start_time.slice(0, 5), done: s.done, title: (Array.isArray(s.meeting_rounds) ? s.meeting_rounds[0]?.title : s.meeting_rounds?.title) ?? "Reunió" })),
  };
}

const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const n1 = (x: number) => x.toFixed(1).replace(".", ",");

/** «Què vigilar»: frases curtes a partir de les dades (de la més important a la menys). Si no hi ha res, una de bona. */
export function watchList(p: Player360, today: string): { level: "red" | "yellow" | "green"; lines: string[] } {
  const red: string[] = [], yellow: string[] = [], good: string[] = [];
  const last7 = p.well.filter((w) => w.date >= addDays(today, -7));
  const prev = p.well.filter((w) => w.date < addDays(today, -7));
  const injuredNow = p.injuries.some((i) => i.start <= today && (!i.end || i.end >= today));
  if (injuredNow) red.push("Està lesionada: segueix la readaptació abans de tornar al grup.");
  // Son, cansament i ànim: la mitjana dels últims 7 dies contra la d'abans
  for (const [k, label] of [["sleep", "la son"], ["fatigue", "l'energia"], ["mood", "l'ànim"]] as const) {
    const a = avg(last7.map((w) => w[k])), b = avg(prev.map((w) => w[k]));
    if (a != null && b != null && b - a >= 1.5) red.push(`Ha baixat ${label}: ${n1(a)} aquesta setmana (abans ${n1(b)}).`);
    else if (a != null && b != null && b - a >= 0.8) yellow.push(`Baixa una mica ${label} (${n1(a)}, abans ${n1(b)}).`);
  }
  if (p.readiness.trend) red.push(`Wellness baixant tres dies seguits (${p.readiness.trend.map(n1).join(" → ")}).`);
  const pains = last7.filter((w) => w.pain).length;
  if (pains >= 2) red.push(`Ha marcat dolor ${pains} dies aquesta setmana.`);
  else if (pains === 1) yellow.push("Ha marcat dolor un dia aquesta setmana.");
  if (p.load?.reliable && p.load.acwr != null) {
    if (p.load.acwr > 1.5) red.push(`Càrrega molt alta respecte al que està acostumada (ACWR ${n1(p.load.acwr)}): risc de lesió.`);
    else if (p.load.acwr > 1.3) yellow.push(`Càrrega pujant (ACWR ${n1(p.load.acwr)}): no és moment d'apretar més.`);
    else if (p.load.acwr < 0.8) yellow.push(`Poca càrrega les últimes setmanes (ACWR ${n1(p.load.acwr)}): cal pujar-la a poc a poc.`);
    else good.push("Càrrega en zona òptima.");
  }
  if (p.missingWell7 >= 2) yellow.push(`Li falten ${p.missingWell7} wellness d'aquesta setmana.`);
  const pct = p.season.marked ? Math.round((p.season.present / p.season.marked) * 100) : null;
  if (pct != null && p.season.marked >= 6 && pct < 75) yellow.push(`Assistència baixa a la temporada (${pct}%).`);
  else if (pct != null && pct >= 90) good.push(`Assistència excel·lent (${pct}%).`);
  const myAvg = avg(last7.map((w) => w.score));
  const teamAvg7 = avg([...p.teamAvg.entries()].filter(([d]) => d >= addDays(today, -7)).map(([, v]) => v));
  if (myAvg != null && teamAvg7 != null && teamAvg7 - myAvg >= 1.2) yellow.push(`Wellness per sota de l'equip (${n1(myAvg)} contra ${n1(teamAvg7)}).`);
  else if (myAvg != null && myAvg >= 7.5) good.push(`Wellness alt (${n1(myAvg)} de mitjana).`);
  if (red.length) return { level: "red", lines: [...red, ...yellow].slice(0, 3) };
  if (yellow.length) return { level: "yellow", lines: yellow.slice(0, 3) };
  return { level: "green", lines: good.length ? [`Tot en ordre. ${good.slice(0, 2).join(" ")}`] : ["Tot en ordre: res a vigilar ara mateix."] };
}
