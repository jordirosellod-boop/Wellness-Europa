import { ewmaAcwr, HISTORY_DAYS, type AcwrResult } from "./acwr";
import { addDays } from "./dates";
import { fetchAll, supabase } from "./supabase";

export type PlayerLoad = {
  result: AcwrResult | null;
  missing: number; // sessions dels últims 28 dies (abans d'avui) sense RPE amb durada
};

/**
 * ACWR de cada jugadora a la data indicada. Llegeix només els RPE dels últims 84 dies
 * (paginat, amb ordre fix) i les sessions dels últims 28 dies per comptar els RPE que falten.
 */
export async function loadTeamAcwr(asOf: string, players: { id: string; created_at?: string }[]): Promise<Map<string, PlayerLoad>> {
  const sb = supabase();
  const from = addDays(asOf, -(HISTORY_DAYS - 1));
  const missingFrom = addDays(asOf, -28);
  const [rows, sessions] = await Promise.all([
    fetchAll<{ player_id: string; session_id: string; load: number | null; sessions: { session_date: string } | { session_date: string }[] }>((f, t) =>
      sb.from("rpe").select("player_id, session_id, load, sessions!inner(session_date)")
        .gte("sessions.session_date", from).lte("sessions.session_date", asOf).order("id").range(f, t),
    ),
    fetchAll<{ id: string; session_date: string }>((f, t) =>
      sb.from("sessions").select("id, session_date").eq("cancelled", false)
        .gte("session_date", missingFrom).lt("session_date", asOf).order("session_date").order("id").range(f, t),
    ),
  ]);
  const daily = new Map<string, Map<string, number>>();
  const done = new Map<string, Set<string>>();
  for (const r of rows) {
    // Supabase retorna la sessió vinculada com a objecte (relació "molts a un").
    const date = Array.isArray(r.sessions) ? r.sessions[0]?.session_date : r.sessions?.session_date;
    if (r.load == null || !date) continue;
    const m = daily.get(r.player_id) ?? new Map<string, number>();
    m.set(date, (m.get(date) ?? 0) + r.load);
    daily.set(r.player_id, m);
    const s = done.get(r.player_id) ?? new Set<string>();
    s.add(r.session_id);
    done.set(r.player_id, s);
  }
  const out = new Map<string, PlayerLoad>();
  for (const p of players) {
    const joined = p.created_at ? p.created_at.slice(0, 10) : "0000-00-00";
    const expected = sessions.filter((s) => s.session_date >= joined);
    const missing = expected.filter((s) => !done.get(p.id)?.has(s.id)).length;
    out.set(p.id, { result: ewmaAcwr(daily.get(p.id) ?? new Map(), asOf), missing });
  }
  return out;
}
