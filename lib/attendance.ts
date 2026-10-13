// Assistència: el staff passa llista (present / absent) i cada jugadora veu la seva.
// Sempre filtrat per sessions i paginat amb un ordre fix (límit de 1.000 files de Supabase).

import { addDays, addMonths, startOfMonth } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import { SESSION_COLS, type Session } from "@/lib/wellness";

/** Motius d'absència (només una categoria: dades mínimes). Han de coincidir amb la base de dades. */
export const ABSENCE_REASONS = [
  ["estudis", "Estudis / exàmens"],
  ["malaltia", "Malaltia"],
  ["lesio", "Lesió"],
  ["familia", "Motius familiars"],
  ["viatge", "Viatge"],
  ["altre_esport", "Altra activitat"],
  ["sense_avisar", "Sense avisar"],
  ["altres", "Altres"],
] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number][0];
export const reasonLabel = (r: string | null | undefined) => ABSENCE_REASONS.find(([k]) => k === r)?.[1] ?? null;

export type Attendance = { session_id: string; player_id: string; present: boolean; reason: AbsenceReason | null };
export const ATT_COLS = "session_id, player_id, present, reason";

/** Sessions no cancel·lades entre dues dates (incloses). */
export async function fetchSessionsBetween(from: string, to: string): Promise<Session[]> {
  const sb = supabase();
  return fetchAll<Session>((f, t) =>
    sb.from("sessions").select(SESSION_COLS).gte("session_date", from).lte("session_date", to).eq("cancelled", false)
      .order("session_date").order("start_time", { nullsFirst: true }).order("id").range(f, t),
  );
}

/** Assistència de les sessions indicades (totes les jugadores si és el staff; només la seva si és jugadora). */
export async function fetchAttendance(sessionIds: string[], playerId?: string): Promise<Attendance[]> {
  if (sessionIds.length === 0) return [];
  const sb = supabase();
  const out: Attendance[] = [];
  // Per trossos, perquè l'adreça de la consulta no sigui massa llarga.
  for (let i = 0; i < sessionIds.length; i += 100) {
    const ids = sessionIds.slice(i, i + 100);
    out.push(
      ...(await fetchAll<Attendance>((f, t) => {
        let q = sb.from("attendance").select(ATT_COLS).in("session_id", ids);
        if (playerId) q = q.eq("player_id", playerId);
        return q.order("session_id").order("player_id").range(f, t);
      })),
    );
  }
  return out;
}

/** Primer i últim dia del mes d'una data. */
export function monthBounds(d: string): { from: string; to: string } {
  const from = startOfMonth(d);
  return { from, to: addDays(addMonths(from, 1), -1) };
}

/** Resum d'assistència als entrenaments: presents de les sessions on s'ha passat llista. */
export function summarize(sessions: Session[], att: Attendance[], playerId: string) {
  const trainings = new Set(sessions.filter((s) => s.kind === "Entrenament").map((s) => s.id));
  const mine = att.filter((a) => a.player_id === playerId && trainings.has(a.session_id));
  const present = mine.filter((a) => a.present).length;
  return { present, marked: mine.length, pct: mine.length ? Math.round((present / mine.length) * 100) : null };
}

export function pctClass(pct: number | null): string {
  if (pct == null) return "";
  return pct >= 90 ? "band-bo" : pct >= 75 ? "band-moderat" : "band-baix";
}
