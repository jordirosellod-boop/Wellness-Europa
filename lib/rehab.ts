// Lesions i entrenaments a part (recuperació, readaptació...) de les jugadores lesionades.

import { fetchAll, supabase } from "@/lib/supabase";

export const REHAB_KINDS = ["Recuperació", "Readaptació", "Fisioteràpia", "Gimnàs", "Altres"] as const;
export type RehabKind = (typeof REHAB_KINDS)[number];

export type Injury = { id: string; player_id: string; start_date: string; end_date: string | null; note: string | null };

export type RehabEntry = {
  id: string;
  player_id: string;
  entry_date: string;
  kind: RehabKind;
  sleep: number | null;
  fatigue: number | null;
  mood: number | null;
  score: number | null;
  pain: number | null;
  rpe: number | null;
  duration_min: number | null;
  load: number | null;
  notes: string | null;
  wellness_at: string | null;
  rpe_at: string | null;
};

export const REHAB_COLS = "id, player_id, entry_date, kind, sleep, fatigue, mood, score, pain, rpe, duration_min, load, notes, wellness_at, rpe_at";

/** Està de baixa aquell dia? */
export function activeOn(i: Pick<Injury, "start_date" | "end_date">, d: string): boolean {
  return i.start_date <= d && (i.end_date == null || i.end_date >= d);
}

/** Lesions que encara duren (o d'un sol jugadora, si es passa playerId). */
export async function fetchInjuries(playerId?: string): Promise<Injury[]> {
  const sb = supabase();
  return fetchAll<Injury>((f, t) => {
    let q = sb.from("injuries").select("id, player_id, start_date, end_date, note");
    if (playerId) q = q.eq("player_id", playerId);
    return q.order("start_date", { ascending: false }).order("id").range(f, t);
  });
}

/** Entrenaments a part entre dues dates (totes si és el staff; les seves si és jugadora). */
export async function fetchRehab(from: string, to: string, playerId?: string): Promise<RehabEntry[]> {
  const sb = supabase();
  return fetchAll<RehabEntry>((f, t) => {
    let q = sb.from("rehab_entries").select(REHAB_COLS).gte("entry_date", from).lte("entry_date", to);
    if (playerId) q = q.eq("player_id", playerId);
    return q.order("entry_date", { ascending: false }).order("id").range(f, t);
  });
}
