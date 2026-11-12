// Ratxa de wellness: quantes sessions seguides l'ha omplert la jugadora.

import { addDays } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import { SESSION_COLS, type Session } from "@/lib/wellness";

/**
 * Compta enrere des de la sessió més recent. Una sessió d'avui sense omplir no la trenca (el dia no s'ha acabat),
 * i tampoc una on consta absent (no hi era: no li toca omplir-lo).
 */
export function countStreak(sessions: Session[], filled: Set<string>, absent: Set<string>, today: string): number {
  const list = [...sessions].sort((a, b) => (b.session_date + (b.start_time ?? "")).localeCompare(a.session_date + (a.start_time ?? "")));
  let n = 0;
  for (const s of list) {
    if (filled.has(s.id)) { n++; continue; }
    if (absent.has(s.id)) continue;
    if (s.session_date === today) continue;
    break;
  }
  return n;
}

export async function fetchStreak(playerId: string, today: string): Promise<number> {
  const sb = supabase();
  const sessions = await fetchAll<Session>((f, t) =>
    sb.from("sessions").select(SESSION_COLS).gte("session_date", addDays(today, -120)).lte("session_date", today).eq("cancelled", false)
      .order("session_date").order("id").range(f, t),
  );
  const ids = sessions.map((s) => s.id);
  if (!ids.length) return 0;
  const filled = new Set<string>(), absent = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [w, a] = await Promise.all([
      sb.from("wellness").select("session_id").eq("player_id", playerId).in("session_id", chunk).range(0, 999),
      sb.from("attendance").select("session_id, present").eq("player_id", playerId).in("session_id", chunk).range(0, 999),
    ]);
    if (w.error) throw new Error(w.error.message);
    for (const x of (w.data ?? []) as { session_id: string }[]) filled.add(x.session_id);
    for (const x of (a.data ?? []) as { session_id: string; present: boolean }[]) if (!x.present) absent.add(x.session_id);
  }
  return countStreak(sessions, filled, absent, today);
}

/** Missatge segons la ratxa (per a l'inici). */
export function streakText(n: number): string {
  if (n >= 20) return "Imparable! 🏆";
  if (n >= 10) return "Quina constància! 💪";
  if (n >= 5) return "Molt bé, segueix així!";
  if (n >= 2) return "Bon començament!";
  return "Omple el wellness cada dia per fer ratxa";
}

/** Nivells de la ratxa: es puja en arribar a 5, 10, 20, 30, 50, 75 i 100 wellness seguits. */
export const STREAK_LEVELS = [5, 10, 20, 30, 50, 75, 100];

/** Nivell actual, quants en falten per al següent i el progrés (0–1) dins el nivell. */
export function streakLevel(n: number): { level: number; from: number; to: number | null; progress: number } {
  const level = STREAK_LEVELS.filter((m) => n >= m).length;
  const from = level ? STREAK_LEVELS[level - 1] : 0;
  const to = STREAK_LEVELS[level] ?? null;
  return { level, from, to, progress: to == null ? 1 : (n - from) / (to - from) };
}
