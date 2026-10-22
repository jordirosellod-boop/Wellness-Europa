// Entreno penjat a l'app: una còpia del full de la plantilla per a les jugadores.
// Sense dades de salut ni d'absències: només hi surten les disponibles, amb el nom curt i la posició.

import type { Plan, Position } from "@/lib/plan";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/wellness";

type RosterLike = { players: Profile[]; positions: Map<string, Position>; nicks: Map<string, string> };
export type PublishedData = { plan: Plan; players: { id: string; name: string; pos: Position | null }[] };
export type PublishedRow = { plan_id: string; plan_date: string; published_at: string; updated_at: string };

/** Fa la còpia per penjar: treu lesionades, baixes, «a part» i motius. */
export function buildSnapshot(plan: Plan, roster: RosterLike, shortName: (r: RosterLike, p: Profile) => string): PublishedData {
  const avail = roster.players.filter((p) => (plan.players[p.id] ?? "disp") === "disp");
  return {
    plan: {
      ...plan,
      players: {},
      reasons: {},
      guests: plan.guests.filter((g) => g.status === "disp"),
      updated_at: undefined,
    },
    players: avail.map((p) => ({ id: p.id, name: shortName(roster, p), pos: roster.positions.get(p.id) ?? null })),
  };
}

/** La còpia penjada → el que necessita el full (les jugadores, totes disponibles). */
export function snapshotRoster(d: PublishedData): RosterLike {
  const list = Array.isArray(d.players) ? d.players : [];
  return {
    players: list.map((p) => ({ id: p.id, role: "player", display_name: p.name })),
    positions: new Map(list.filter((p) => p.pos).map((p) => [p.id, p.pos as Position])),
    nicks: new Map(list.map((p) => [p.id, p.name])),
  };
}

export async function fetchPublishedList(from: string): Promise<PublishedRow[]> {
  const { data, error } = await supabase()
    .from("published_trainings")
    .select("plan_id, plan_date, published_at, updated_at")
    .gte("plan_date", from)
    .order("plan_date", { ascending: false })
    .order("plan_id")
    .range(0, 29);
  if (error) throw new Error(error.message);
  return (data ?? []) as PublishedRow[];
}

export async function fetchPublished(planId: string): Promise<PublishedData | null> {
  const { data, error } = await supabase().from("published_trainings").select("data").eq("plan_id", planId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data.data as PublishedData) : null;
}
