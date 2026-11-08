// Petos: cada dia d'entreno o partit una jugadora els porta, per ordre de dorsal.
// Si no hi és (absent a la llista o lesionada), li toca a la següent. Ho calcula la base de dades.

import { fetchAll, supabase } from "@/lib/supabase";

export type BibDay = { day: string; player_id: string; display_name: string; dorsal: number | null; manual: boolean };

export async function fetchBibs(from: string, to: string): Promise<BibDay[]> {
  const { data, error } = await supabase().rpc("bib_schedule", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as BibDay[]) : [];
}

export const bibName = (b: Pick<BibDay, "display_name" | "dorsal">) => `${b.display_name}${b.dorsal != null ? ` (${b.dorsal})` : ""}`;

export type BibPlayer = { id: string; name: string; dorsal: number | null; bib: number | null };

/** Jugadores amb el dorsal dels petos (el fix; si no en té, el de l'app o el de la FCF), per triar a mà. Només staff. */
export async function fetchBibPlayers(): Promise<BibPlayer[]> {
  const sb = supabase();
  const [players, nums, fcf, bibs] = await Promise.all([
    fetchAll<{ id: string; display_name: string }>((f, t) => sb.from("profiles").select("id, display_name").eq("role", "player").order("display_name").order("id").range(f, t)),
    fetchAll<{ profile_id: string; dorsal: number }>((f, t) => sb.from("player_numbers").select("profile_id, dorsal").order("profile_id").range(f, t)),
    fetchAll<{ profile_id: string | null; dorsal: string | null }>((f, t) =>
      sb.from("fcf_players").select("profile_id, dorsal").not("profile_id", "is", null).order("fcf_id").range(f, t),
    ),
    fetchAll<{ player_id: string; dorsal: number }>((f, t) => sb.from("bib_numbers").select("player_id, dorsal").order("player_id").range(f, t)),
  ]);
  const bib = new Map(bibs.map((b) => [b.player_id, b.dorsal]));
  const own = new Map(nums.map((n) => [n.profile_id, n.dorsal]));
  const fed = new Map(fcf.filter((x) => x.profile_id && /^\d{1,2}$/.test(x.dorsal ?? "")).map((x) => [x.profile_id as string, Number(x.dorsal)]));
  return players
    .map((p) => ({ id: p.id, name: p.display_name, bib: bib.get(p.id) ?? null, dorsal: bib.get(p.id) ?? own.get(p.id) ?? fed.get(p.id) ?? null }))
    .sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999) || a.name.localeCompare(b.name));
}

export type BibSettings = { start_date: string | null; start_player: string | null };
export async function fetchBibSettings(): Promise<BibSettings> {
  const { data, error } = await supabase().from("bib_settings").select("start_date, start_player").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BibSettings | null) ?? { start_date: null, start_player: null };
}
