// Grups de material i porteria: cada setmana un grup porta el material i un altre les porteries (rotant).

import { fetchAll, supabase } from "@/lib/supabase";

export type DutyRow = { grp: number; task: "material" | "porteria" | null; player_id: string | null; display_name: string | null; label: string | null };
export type DutyGroup = { grp: number; task: DutyRow["task"]; label: string | null; players: { id: string; name: string }[] };
export type DutySettings = { groups: number; anchor_week: string; anchor_material: number; anchor_goal: number; labels: Record<string, string> };

/** «Grup 1 (Rose)» */
export const groupName = (g: Pick<DutyGroup, "grp" | "label">) => `Grup ${g.grp}${g.label ? ` (${g.label})` : ""}`;

export const TASK_LABEL = { material: "🧺 Material", porteria: "🥅 Porteria" } as const;

/** Grups (amb les jugadores) i què li toca a cadascun la setmana que comença a `week`. */
export async function fetchDuties(week: string): Promise<DutyGroup[]> {
  const { data, error } = await supabase().rpc("duty_week", { p_week: week });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? (data as DutyRow[]) : [];
  const groups = new Map<number, DutyGroup>();
  for (const r of rows) {
    const g = groups.get(r.grp) ?? { grp: r.grp, task: r.task, label: r.label ?? null, players: [] };
    if (r.player_id && r.display_name) g.players.push({ id: r.player_id, name: r.display_name });
    groups.set(r.grp, g);
  }
  return [...groups.values()].sort((a, b) => a.grp - b.grp);
}

export const dutyOf = (groups: DutyGroup[], task: "material" | "porteria") => groups.find((g) => g.task === task) ?? null;
export const firstNames = (g: DutyGroup) => g.players.map((p) => p.name.split(" ")[0]).join(", ");

/** Només staff: configuració i a quin grup és cada jugadora. */
export async function fetchDutySettings(): Promise<DutySettings | null> {
  const { data, error } = await supabase().from("duty_settings").select("groups, anchor_week, anchor_material, anchor_goal, labels").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DutySettings | null) ?? null;
}
export async function fetchDutyMembers(): Promise<Map<string, number>> {
  const rows = await fetchAll<{ player_id: string; grp: number }>((f, t) => supabase().from("duty_groups").select("player_id, grp").order("player_id").range(f, t));
  return new Map(rows.map((r) => [r.player_id, r.grp]));
}
