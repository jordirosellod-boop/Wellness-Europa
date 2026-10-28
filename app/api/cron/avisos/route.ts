import type { SupabaseClient } from "@supabase/supabase-js";
import { hhmm, KITS, kitOf } from "@/lib/convo";
import { addDays, isoDow, startOfWeek } from "@/lib/dates";
import { madridEpoch } from "@/lib/matchday";
import { claimPush, adminClient, pushTo, pushToStaff } from "@/lib/server-admin";
import { fetchAll } from "@/lib/supabase";
import { nowMadridHHMM, todayMadrid } from "@/lib/wellness";

// L'executa la base de dades (pg_cron) cada 15 minuts. Mira si toca enviar algun avís i,
// si toca, l'envia una sola vegada (queda apuntat a push_log):
//  · la vigília a les 19 h: a qui li toquen els petos l'endemà
//  · dilluns a les 9 h: als grups de material i de porteria de la setmana
//  · el dia de partit, 2 h abans de la quedada: a les convocades
//  · cada dia a les 22 h: a qui encara no ha fet l'RPE d'avui (menys les absents o que han avisat)
//  · diumenge a les 20 h: resum de la setmana al staff
export async function POST(req: Request) {
  const db = adminClient();
  const { data: secret } = await db.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
  const given = req.headers.get("x-cron-secret");
  if (!secret?.value || !given || given !== secret.value) {
    return Response.json({ error: "No autoritzat." }, { status: 401 });
  }

  const today = todayMadrid();
  const hour = Number(nowMadridHHMM().slice(0, 2));
  const dow = isoDow(today);
  const done: Record<string, number> = {};
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<number | null>) => {
    try {
      const n = await fn();
      if (n != null) done[name] = n;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (hour >= 19 && hour < 22) await step("petos", () => bibsTomorrow(db, addDays(today, 1)));
  if (dow === 1 && hour >= 9 && hour < 13) await step("grups", () => dutyGroups(db, today));
  await step("quedada", () => meetReminder(db, today));
  if (hour === 22) await step("rpe", () => rpeReminder(db, today));
  if (dow === 7 && hour >= 20 && hour < 23) await step("resum", () => weeklySummary(db, today));

  return Response.json({ done, errors }, { status: errors.length ? 500 : 200 });
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** La vigília: avís a la jugadora que porta els petos l'endemà. */
async function bibsTomorrow(db: SupabaseClient, day: string): Promise<number | null> {
  const { data, error } = await db.rpc("bib_schedule", { p_from: day, p_to: day });
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as { player_id: string; display_name: string }[])[0];
  if (!row || !(await claimPush(db, `petos:${day}`))) return null;
  return pushTo(db, [row.player_id], {
    title: "🦺 Demà et toquen els petos",
    body: `${first(row.display_name)}, demà els portes tu. Que no se t'oblidin!`,
    url: "/j",
  });
}

/** Dilluns: avís als dos grups que aquesta setmana porten el material i les porteries. */
async function dutyGroups(db: SupabaseClient, today: string): Promise<number | null> {
  const week = startOfWeek(today);
  const { data, error } = await db.rpc("duty_week", { p_week: week });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { grp: number; task: "material" | "porteria" | null; player_id: string | null; label: string | null }[];
  if (!rows.some((r) => r.task && r.player_id) || !(await claimPush(db, `grups:${week}`))) return null;
  let sent = 0;
  for (const task of ["material", "porteria"] as const) {
    const mine = rows.filter((r) => r.task === task && r.player_id);
    if (!mine.length) continue;
    const g = mine[0];
    const name = `Grup ${g.grp}${g.label ? ` (${g.label})` : ""}`;
    sent += await pushTo(db, mine.map((r) => r.player_id!), task === "material"
      ? { title: "🧺 Aquesta setmana porteu el material", body: `${name}: us toca el material tota la setmana.`, url: "/j" }
      : { title: "🥅 Aquesta setmana porteu les porteries", body: `${name}: us toquen les porteries tota la setmana.`, url: "/j" });
  }
  return sent;
}

/** Dia de partit: 2 hores abans de la quedada, avís a les convocades. */
async function meetReminder(db: SupabaseClient, today: string): Promise<number | null> {
  const { data, error } = await db.from("convocations").select("id, match_date, meet_time, kickoff, venue, kit")
    .eq("match_date", today).eq("published", true).not("meet_time", "is", null).order("meet_time").range(0, 9);
  if (error) throw new Error(error.message);
  let sent: number | null = null;
  for (const c of (data ?? []) as { id: string; match_date: string; meet_time: string; kickoff: string | null; venue: string | null; kit: string | null }[]) {
    const left = madridEpoch(c.match_date, c.meet_time) - Date.now();
    if (left <= 0 || left > 2 * 3600_000) continue;
    if (!(await claimPush(db, `quedada:${c.id}`))) continue;
    const called = await fetchAll<{ player_id: string }>((f, t) =>
      db.from("convocation_players").select("player_id").eq("convocation_id", c.id).eq("called", true).order("player_id").range(f, t));
    const key = kitOf(c.kit);
    const kit = key ? KITS.find((k) => k.key === key)?.value : c.kit;
    const body = [`Quedada a les ${hhmm(c.meet_time)}${c.venue ? ` a ${c.venue}` : ""}.`, kit ? `Porta la ${kit}.` : "", "Som-hi! 💙"].filter(Boolean).join(" ");
    sent = (sent ?? 0) + await pushTo(db, called.map((r) => r.player_id), { title: "⚽ Avui hi ha partit", body, url: "/j" });
  }
  return sent;
}

/** A les 22 h: recordatori de l'RPE a qui encara no l'ha fet (tenen fins a les 00:00). */
async function rpeReminder(db: SupabaseClient, today: string): Promise<number | null> {
  const sessions = await fetchAll<{ id: string }>((f, t) =>
    db.from("sessions").select("id").eq("session_date", today).eq("cancelled", false).order("id").range(f, t));
  if (!sessions.length || !(await claimPush(db, `rpe:${today}`))) return null;
  const ids = sessions.map((s) => s.id);
  const [players, rpe, att, notices] = await Promise.all([
    fetchAll<{ id: string }>((f, t) => db.from("profiles").select("id").eq("role", "player").order("id").range(f, t)),
    fetchAll<{ session_id: string; player_id: string }>((f, t) => db.from("rpe").select("session_id, player_id").in("session_id", ids).order("id").range(f, t)),
    fetchAll<{ session_id: string; player_id: string }>((f, t) =>
      db.from("attendance").select("session_id, player_id").in("session_id", ids).eq("present", false).order("session_id").order("player_id").range(f, t)),
    fetchAll<{ session_id: string; player_id: string }>((f, t) =>
      db.from("absence_notices").select("session_id, player_id").in("session_id", ids).order("session_id").order("player_id").range(f, t)),
  ]);
  const key = (x: { session_id: string; player_id: string }) => `${x.session_id}:${x.player_id}`;
  const done = new Set(rpe.map(key));
  const skip = new Set([...att, ...notices].map(key));
  const missing = players.filter((p) => ids.some((sid) => !done.has(`${sid}:${p.id}`) && !skip.has(`${sid}:${p.id}`))).map((p) => p.id);
  return pushTo(db, missing, { title: "⏰ Et falta l'RPE d'avui", body: "Tens fins a les 00:00 per omplir-lo. Només et costarà un minut!", url: "/j?s=avui" });
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

/** Diumenge al vespre: resum de la setmana per al staff (sense noms: surt a la pantalla de bloqueig). */
async function weeklySummary(db: SupabaseClient, today: string): Promise<number | null> {
  const from = startOfWeek(today);
  const sessions = await fetchAll<{ id: string; kind: string }>((f, t) =>
    db.from("sessions").select("id, kind").gte("session_date", from).lte("session_date", today).eq("cancelled", false).order("id").range(f, t));
  if (!sessions.length || !(await claimPush(db, `resum:${from}`))) return null;
  const ids = sessions.map((s) => s.id);
  const trainings = new Set(sessions.filter((s) => s.kind === "Entrenament").map((s) => s.id));
  const [players, att, well, rpe, inj] = await Promise.all([
    fetchAll<{ id: string }>((f, t) => db.from("profiles").select("id").eq("role", "player").order("id").range(f, t)),
    fetchAll<{ session_id: string; player_id: string; present: boolean }>((f, t) =>
      db.from("attendance").select("session_id, player_id, present").in("session_id", ids).order("session_id").order("player_id").range(f, t)),
    fetchAll<{ session_id: string; player_id: string; score: number }>((f, t) =>
      db.from("wellness").select("session_id, player_id, score").in("session_id", ids).order("id").range(f, t)),
    fetchAll<{ session_id: string; player_id: string }>((f, t) =>
      db.from("rpe").select("session_id, player_id").in("session_id", ids).order("id").range(f, t)),
    fetchAll<{ id: string }>((f, t) =>
      db.from("injuries").select("id").lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("id").range(f, t)),
  ]);
  const trainAtt = att.filter((a) => trainings.has(a.session_id));
  const absent = new Set(att.filter((a) => !a.present).map((a) => `${a.session_id}:${a.player_id}`));
  // Respostes esperades: cada jugadora a cada sessió, menys les absències
  const expected = sessions.length * players.length - absent.size;
  const avg = well.length ? well.reduce((a, w) => a + Number(w.score), 0) / well.length : null;
  const parts = [
    trainAtt.length ? `Assistència ${pct(trainAtt.filter((a) => a.present).length, trainAtt.length)}%` : null,
    avg != null ? `Wellness ${avg.toFixed(1).replace(".", ",")} de mitjana (${pct(well.length, expected)}% omplerts)` : "Cap wellness omplert",
    `RPE ${pct(rpe.length, expected) ?? 0}% omplerts`,
    inj.length ? `${inj.length} ${inj.length === 1 ? "lesionada" : "lesionades"}` : null,
  ].filter(Boolean);
  return pushToStaff(db, {
    title: `📊 Resum de la setmana · ${trainings.size} ${trainings.size === 1 ? "entreno" : "entrenos"}`,
    body: parts.join(" · "),
    url: "/entrenador",
  });
}
