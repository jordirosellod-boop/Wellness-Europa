// Convocatòries: dades, lectura i sistemes de joc per a la pissarra de l'onze (staff).

import { fetchAll, supabase } from "@/lib/supabase";

export type Convocation = {
  id: string;
  match_date: string;
  kickoff: string | null;
  meet_time: string | null;
  rival: string;
  is_home: boolean;
  competition: string | null;
  venue: string | null;
  address: string | null;
  kit: string | null;
  notes: string | null;
  published: boolean;
  published_at: string | null;
  notified_at: string | null;
};

export type RosterRow = { player_id: string; display_name: string; dorsal: number | null; called: boolean };

export const CONVO_COLS =
  "id, match_date, kickoff, meet_time, rival, is_home, competition, venue, address, kit, notes, published, published_at, notified_at";

/** Convocatòries des d'una data (les que pot veure qui ho demana), ordenades per data. */
export async function fetchConvocations(from: string): Promise<Convocation[]> {
  const sb = supabase();
  return fetchAll<Convocation>((f, t) =>
    sb.from("convocations").select(CONVO_COLS).gte("match_date", from).order("match_date").order("kickoff", { nullsFirst: true }).order("id").range(f, t),
  );
}

export async function fetchRoster(cid: string): Promise<RosterRow[]> {
  const { data, error } = await supabase().rpc("convo_roster", { cid });
  if (error) throw new Error(error.message);
  return (data ?? []) as RosterRow[];
}

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

// ---------- Sistemes de joc ----------
// Posicions en % del camp: x d'esquerra a dreta, y des de la porteria pròpia (0) fins a la contrària (100).
// La posició 0 sempre és la portera. En canviar de sistema, cada jugadora es queda al mateix número de
// posició i es mou cap al lloc nou.
export type Spot = { x: number; y: number; label: string };

const GK: Spot = { x: 50, y: 5, label: "POR" };
const D4: Spot[] = [
  { x: 12, y: 26, label: "LI" }, { x: 37, y: 21, label: "DFC" }, { x: 63, y: 21, label: "DFC" }, { x: 88, y: 26, label: "LD" },
];
const D3: Spot[] = [{ x: 24, y: 24, label: "DFC" }, { x: 50, y: 23, label: "DFC" }, { x: 76, y: 24, label: "DFC" }];
const D5: Spot[] = [
  { x: 8, y: 33, label: "CI" }, { x: 29, y: 24, label: "DFC" }, { x: 50, y: 23, label: "DFC" }, { x: 71, y: 24, label: "DFC" }, { x: 92, y: 33, label: "CD" },
];
const M4: Spot[] = [
  { x: 12, y: 52, label: "MI" }, { x: 37, y: 47, label: "MC" }, { x: 63, y: 47, label: "MC" }, { x: 88, y: 52, label: "MD" },
];

export const FORMATIONS: Record<string, Spot[]> = {
  "4-4-2": [GK, ...D4, ...M4, { x: 38, y: 76, label: "DC" }, { x: 62, y: 76, label: "DC" }],
  "4-3-3": [GK, ...D4, { x: 30, y: 49, label: "MC" }, { x: 50, y: 42, label: "MCD" }, { x: 70, y: 49, label: "MC" },
    { x: 15, y: 75, label: "EI" }, { x: 50, y: 81, label: "DC" }, { x: 85, y: 75, label: "ED" }],
  "4-2-3-1": [GK, ...D4, { x: 37, y: 41, label: "MCD" }, { x: 63, y: 41, label: "MCD" },
    { x: 14, y: 63, label: "EI" }, { x: 50, y: 61, label: "MCO" }, { x: 86, y: 63, label: "ED" }, { x: 50, y: 82, label: "DC" }],
  "4-1-4-1": [GK, ...D4, { x: 50, y: 38, label: "MCD" },
    { x: 12, y: 57, label: "MI" }, { x: 37, y: 55, label: "MC" }, { x: 63, y: 55, label: "MC" }, { x: 88, y: 57, label: "MD" }, { x: 50, y: 81, label: "DC" }],
  "4-4-1-1": [GK, ...D4, ...M4, { x: 50, y: 64, label: "MP" }, { x: 50, y: 82, label: "DC" }],
  "4-3-1-2": [GK, ...D4, { x: 28, y: 45, label: "MC" }, { x: 50, y: 39, label: "MCD" }, { x: 72, y: 45, label: "MC" },
    { x: 50, y: 61, label: "MP" }, { x: 38, y: 79, label: "DC" }, { x: 62, y: 79, label: "DC" }],
  "4-5-1": [GK, ...D4, { x: 10, y: 54, label: "MI" }, { x: 30, y: 49, label: "MC" }, { x: 50, y: 42, label: "MCD" }, { x: 70, y: 49, label: "MC" },
    { x: 90, y: 54, label: "MD" }, { x: 50, y: 79, label: "DC" }],
  "3-5-2": [GK, ...D3, { x: 8, y: 50, label: "CI" }, { x: 32, y: 46, label: "MC" }, { x: 50, y: 39, label: "MCD" }, { x: 68, y: 46, label: "MC" },
    { x: 92, y: 50, label: "CD" }, { x: 38, y: 76, label: "DC" }, { x: 62, y: 76, label: "DC" }],
  "3-4-3": [GK, ...D3, ...M4, { x: 17, y: 75, label: "EI" }, { x: 50, y: 81, label: "DC" }, { x: 83, y: 75, label: "ED" }],
  "3-4-1-2": [GK, ...D3, ...M4, { x: 50, y: 63, label: "MP" }, { x: 38, y: 80, label: "DC" }, { x: 62, y: 80, label: "DC" }],
  "5-3-2": [GK, ...D5, { x: 30, y: 49, label: "MC" }, { x: 50, y: 45, label: "MC" }, { x: 70, y: 49, label: "MC" },
    { x: 38, y: 76, label: "DC" }, { x: 62, y: 76, label: "DC" }],
  "5-4-1": [GK, ...D5, { x: 14, y: 54, label: "MI" }, { x: 38, y: 49, label: "MC" }, { x: 62, y: 49, label: "MC" }, { x: 86, y: 54, label: "MD" },
    { x: 50, y: 79, label: "DC" }],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);
