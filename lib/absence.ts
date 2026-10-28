// Avisos de baixa: la jugadora avisa des de l'app que no podrà venir a un entreno.

import { ABSENCE_REASONS, type AbsenceReason } from "@/lib/attendance";
import { fetchAll, supabase } from "@/lib/supabase";
import { nowMadridHHMM, todayMadrid, type Session } from "@/lib/wellness";

/** Els motius que pot triar ella (els mateixos que a la llista, menys «Sense avisar»). */
export const NOTICE_REASONS = ABSENCE_REASONS.filter(([k]) => k !== "sense_avisar");
export type Notice = { session_id: string; player_id: string; reason: AbsenceReason; note: string | null; created_at: string };
export const NOTICE_COLS = "session_id, player_id, reason, note, created_at";

/** Encara hi és a temps? (entreno no cancel·lat, i abans que comenci). Ho torna a comprovar la base de dades. */
export function noticeOpen(s: Pick<Session, "kind" | "cancelled" | "session_date" | "start_time">): boolean {
  if (s.kind !== "Entrenament" || s.cancelled) return false;
  const today = todayMadrid();
  if (s.session_date > today) return true;
  return s.session_date === today && (!s.start_time || s.start_time.slice(0, 5) > nowMadridHHMM());
}

export async function fetchNotices(sessionIds: string[]): Promise<Notice[]> {
  if (!sessionIds.length) return [];
  const out: Notice[] = [];
  for (let i = 0; i < sessionIds.length; i += 100) {
    const ids = sessionIds.slice(i, i + 100);
    out.push(...await fetchAll<Notice>((f, t) =>
      supabase().from("absence_notices").select(NOTICE_COLS).in("session_id", ids).order("session_id").order("player_id").range(f, t)));
  }
  return out;
}

export async function saveNotice(sessionId: string, reason: AbsenceReason, note: string | null): Promise<Notice> {
  const { data, error } = await supabase().from("absence_notices")
    .upsert({ session_id: sessionId, reason, note: note?.replace(/[<>]/g, "").trim().slice(0, 120) || null }, { onConflict: "session_id,player_id" })
    .select(NOTICE_COLS).single();
  if (error || !data) throw new Error(error?.message ?? "No s'ha pogut desar.");
  return data as Notice;
}

export async function deleteNotice(sessionId: string, playerId: string): Promise<void> {
  const { data, error } = await supabase().from("absence_notices").delete().eq("session_id", sessionId).eq("player_id", playerId).select("session_id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Ja no es pot desfer (l'entreno ja ha començat).");
}
