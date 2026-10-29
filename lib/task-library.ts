// Biblioteca de tasques: les del responsable, per reutilitzar-les en altres entrenos.

import { fetchAll, supabase } from "@/lib/supabase";
import { uid, type Task } from "@/lib/plan";

export type LibraryItem = { id: string; title: string; type: string; contents: string[]; task: Task; uses: number; last_used_at: string | null; updated_at: string };
const COLS = "id, title, type, contents, task, uses, last_used_at, updated_at";

export async function fetchLibrary(): Promise<LibraryItem[]> {
  return fetchAll<LibraryItem>((f, t) =>
    supabase().from("task_library").select(COLS).order("uses", { ascending: false }).order("updated_at", { ascending: false }).order("id").range(f, t));
}

/** Guarda la tasca (sense els equips del dia, que són de cada entreno). */
export async function saveToLibrary(task: Task, title: string, contents: string[]): Promise<LibraryItem> {
  const clean: Task = { ...task, squads: [], teams: "" };
  const { data, error } = await supabase().from("task_library")
    .insert({ title: title.replace(/[<>]/g, "").trim().slice(0, 80), type: task.type.slice(0, 60), contents: contents.slice(0, 10), task: clean })
    .select(COLS).single();
  if (error || !data) throw new Error(error?.message ?? "No s'ha pogut guardar.");
  return data as LibraryItem;
}

/** Torna una còpia nova per posar-la a l'entreno, i en suma l'ús (perquè surti més amunt). */
export async function takeFromLibrary(item: LibraryItem): Promise<Task> {
  void supabase().from("task_library").update({ uses: item.uses + 1, last_used_at: new Date().toISOString() }).eq("id", item.id).then(() => {});
  return { ...item.task, id: uid(), squads: [], diagram: { ...item.task.diagram, els: item.task.diagram.els.map((e) => ({ ...e, id: uid() })) } };
}

export async function removeFromLibrary(id: string): Promise<void> {
  const { data, error } = await supabase().from("task_library").delete().eq("id", id).select("id");
  if (error || !data?.length) throw new Error(error?.message ?? "No s'ha pogut esborrar.");
}

/** Minuts d'una tasca a partir del text («15'», «15 min», «2x7'»...). */
export function taskMinutes(t: Pick<Task, "total" | "time">): number | null {
  const parse = (s: string) => {
    const x = s.toLowerCase().replace(",", ".");
    const m = x.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
    if (m) return Math.round(Number(m[1]) * Number(m[2]));
    const n = x.match(/(\d+(?:\.\d+)?)/);
    return n ? Math.round(Number(n[1])) : null;
  };
  return (t.total && parse(t.total)) || (t.time && parse(t.time)) || null;
}
