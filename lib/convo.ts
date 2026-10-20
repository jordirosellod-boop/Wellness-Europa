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

/** Una fila de la llista. Les afegides (d'un altre equip) porten `origin` i sempre estan convocades. */
export type RosterRow = { player_id: string; display_name: string; dorsal: number | null; called: boolean; guest?: boolean; origin?: string | null };
export type Guest = { id: string; name: string; dorsal: number | null; origin: string | null };

/** Els amistosos es guarden amb la competició «Amistós» (i surten a part de la lliga). */
export const FRIENDLY = "Amistós";
export const isFriendly = (c: { competition: string | null }) => /^amist/i.test(c.competition?.trim() ?? "");

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
  const sb = supabase();
  const [{ data, error }, guests] = await Promise.all([
    sb.rpc("convo_roster", { cid }),
    fetchAll<Guest>((f, t) =>
      sb.from("convocation_guests").select("id, name, dorsal, origin").eq("convocation_id", cid).order("created_at").order("id").range(f, t),
    ),
  ]);
  if (error) throw new Error(error.message);
  return [
    ...((data ?? []) as RosterRow[]),
    ...guests.map((g) => ({ player_id: g.id, display_name: g.name, dorsal: g.dorsal, called: true, guest: true, origin: g.origin })),
  ];
}

/** Equips d'on solen pujar jugadores (es pot escriure qualsevol altre). */
export const GUEST_ORIGINS = ["Cadet A", "Juvenil D"];

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

// ---------- Equipacions ----------
export type KitKey = "home" | "away";
export const KITS: { key: KitKey; value: string; label: string; img: string }[] = [
  { key: "home", value: "1a equipació", label: "1a · Blanca", img: "/kits/home.webp" },
  { key: "away", value: "2a equipació", label: "2a · Blava", img: "/kits/away.webp" },
];
/** Quina equipació és, a partir del text desat («1a equipació», «Blava (2a)», «blanca»…). */
export function kitOf(kit: string | null | undefined): KitKey | null {
  const k = (kit ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!k.trim()) return null;
  // el número mana (1a / 2a); si no n'hi ha, el color
  if (/\b1a\b|primera/.test(k)) return "home";
  if (/\b2a\b|segona/.test(k)) return "away";
  if (/blava|blau|marino|fosca/.test(k)) return "away";
  if (/blanca|blanc/.test(k)) return "home";
  return null;
}

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
