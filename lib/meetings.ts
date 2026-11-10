// Reunions individuals: rondes amb franges (dia + hora) i una jugadora a cada franja.
// Sense notes: només dia i hora. La jugadora només veu la seva (ho controla la base de dades).

import { addDays, isoDow } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";

export type MeetingRound = { id: string; title: string; duration_min: number; published: boolean; published_at: string | null; created_at: string };
export type MeetingSlot = { id: string; round_id: string; day: string; start_time: string; player_id: string | null; done: boolean };
/** Franja de cada setmana: dia (1 = dilluns … 7 = diumenge), de quina hora a quina, i què es fa aquella hora. */
export type Window = { dow: number; from: string; to: string; label: string };

export const DOW_NAMES = ["", "Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"];

/** Les franges habituals del Juvenil C: dilluns abans de l'entreno, i l'hora de gym i de físic. */
export const DEFAULT_WINDOWS: Window[] = [
  { dow: 1, from: "19:00", to: "19:30", label: "Abans de l'entreno" },
  { dow: 2, from: "18:30", to: "19:30", label: "Hora de gym" },
  { dow: 4, from: "19:30", to: "20:25", label: "Hora de físic" },
];

const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const toHm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const hm = (t: string) => t.slice(0, 5);
export const endOf = (t: string, minutes: number) => toHm(toMin(hm(t)) + minutes);

/**
 * Reparteix les jugadores (en l'ordre donat) a les franges, a partir del dia `start`, fins que n'hi ha prou.
 * Les places que sobren de l'últim dia queden lliures (per poder-hi moure algú si no pot venir).
 */
export function planSlots(players: string[], start: string, windows: Window[], minutes: number, skip: Set<string> = new Set()): { day: string; start_time: string; player_id: string | null }[] {
  const out: { day: string; start_time: string; player_id: string | null }[] = [];
  const ws = windows.filter((w) => toMin(w.to) - toMin(w.from) >= minutes);
  if (!ws.length || !players.length) return out;
  let i = 0;
  for (let d = 0; d < 120 && i < players.length; d++) {
    const day = addDays(start, d);
    if (skip.has(day)) continue;
    for (const w of ws.filter((x) => x.dow === isoDow(day)).sort((a, b) => toMin(a.from) - toMin(b.from))) {
      for (let t = toMin(w.from); t + minutes <= toMin(w.to); t += minutes) {
        out.push({ day, start_time: toHm(t), player_id: i < players.length ? players[i++] : null });
      }
    }
  }
  return out;
}

/** Quina franja (de les habituals) correspon a un dia i hora: per posar «Hora de gym», etc. */
export function windowOf(windows: Window[], day: string, t: string): Window | null {
  const m = toMin(hm(t));
  return windows.find((w) => w.dow === isoDow(day) && m >= toMin(w.from) && m < toMin(w.to)) ?? null;
}

export async function fetchRounds(): Promise<MeetingRound[]> {
  const sb = supabase();
  return fetchAll<MeetingRound>((f, t) => sb.from("meeting_rounds").select("id, title, duration_min, published, published_at, created_at").order("created_at", { ascending: false }).order("id").range(f, t));
}

export async function fetchSlots(roundId: string): Promise<MeetingSlot[]> {
  const sb = supabase();
  return fetchAll<MeetingSlot>((f, t) => sb.from("meeting_slots").select("id, round_id, day, start_time, player_id, done").eq("round_id", roundId).order("day").order("start_time").order("id").range(f, t));
}

/** La propera reunió de la jugadora (de rondes publicades), si en té. */
export async function fetchMyNextMeeting(meId: string, today: string): Promise<(MeetingSlot & { duration_min: number; title: string }) | null> {
  const sb = supabase();
  const { data, error } = await sb.from("meeting_slots").select("id, round_id, day, start_time, player_id, done, meeting_rounds(title, duration_min)")
    .eq("player_id", meId).eq("done", false).gte("day", today).order("day").order("start_time").limit(1);
  if (error) throw new Error(error.message);
  const r = (data ?? [])[0] as (MeetingSlot & { meeting_rounds: { title: string; duration_min: number } | { title: string; duration_min: number }[] | null }) | undefined;
  if (!r) return null;
  const round = Array.isArray(r.meeting_rounds) ? r.meeting_rounds[0] : r.meeting_rounds;
  return { id: r.id, round_id: r.round_id, day: r.day, start_time: r.start_time, player_id: r.player_id, done: r.done, title: round?.title ?? "Reunió", duration_min: round?.duration_min ?? 15 };
}
