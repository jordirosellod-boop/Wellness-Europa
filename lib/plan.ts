// Plantilla d'entrenament (privada de qui la fa): tipus i dades.

import type { AbsenceReason } from "@/lib/attendance";
import { fetchAll, supabase } from "@/lib/supabase";

export const POSITIONS = ["PO", "LT", "CT", "MC", "INT", "EXT", "PT"] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_NAMES: Record<Position, string> = {
  PO: "Portera", LT: "Lateral", CT: "Central", MC: "Migcampista", INT: "Interior", EXT: "Extrem", PT: "Punta",
};

export const CONTENTS = ["Atac organitzat", "Replegament defensiu", "Transicions", "Pressió tras pèrdua", "ABP", "Físic"] as const;
export const TASK_TYPES = ["RDP", "Rondo", "Possessió", "Joc de posició", "Finalització específica", "Partits reduïts", "Partit", "ABP", "Activació", "Físic", "Tornada a la calma"];

/** Estat de cada jugadora aquell dia: disponible, lesionada, a part (recuperació) o baixa (no ve). */
export type PlayerStatus = "disp" | "les" | "part" | "baixa";
export const STATUS_LABEL: Record<PlayerStatus, string> = { disp: "Disponible", les: "Lesionada", part: "A part", baixa: "Baixa" };

// ---------- Dibuix de l'exercici ----------
export type Field = "full" | "half" | "blank";
export type Team = "blue" | "red" | "yellow" | "white" | "gk";
export type ArrowKind = "pass" | "run" | "drive" | "shot";
/** `s` és la mida (1 = normal). */
export type El =
  | { id: string; t: "player"; x: number; y: number; team: Team; label?: string; s?: number }
  | { id: string; t: "cone" | "ball" | "minigoal" | "goal"; x: number; y: number; s?: number; r?: number } // r: orientació en graus
  | { id: string; t: "arrow"; x: number; y: number; x2: number; y2: number; kind: ArrowKind; s?: number };
export type Diagram = { field: Field; els: El[] };

/** Jugadora afegida a mà a la plantilla (no té compte a l'app: p. ex. una d'un altre equip). */
export type Guest = { id: string; name: string; pos: Position | ""; status: Exclude<PlayerStatus, "les"> };

export type StaffRole = { who: string; role: string; extra: string };

/** Equip d'una tasca: color (com al dibuix) i les jugadores (ids de l'app o d'afegides a mà). */
export type Squad = { c: Team; ids: string[] };
export const SQUAD_NAMES: Record<Team, string> = { blue: "Blau", red: "Vermell", yellow: "Groc", white: "Blanc", gk: "Comodins" };

export type Task = {
  id: string;
  type: string;
  code: string;
  time: string;
  total: string;
  space: string;
  gks: string;
  description: string;
  objective: string;
  rules: string;
  cues: string;
  teams: string; // notes dels equips (text lliure)
  squads?: Squad[];
  scoring: string;
  staff: StaffRole[];
  diagram: Diagram;
  image: string | null; // imatge pujada (en lloc del dibuix), en format data:
};

export type Plan = {
  id: string;
  session_id: string | null;
  plan_date: string;
  start_time: string | null;
  session_no: string | null;
  jornada: string | null;
  rival: string | null;
  microcycle: string | null;
  mesocycle: string | null;
  duration_min: number | null;
  contents: string[];
  observations: string | null;
  score_notes: string | null;
  players: Record<string, PlayerStatus>;
  guests: Guest[];
  reasons: Record<string, AbsenceReason>; // motiu de cada baixa (id de jugadora o d'afegida)
  tasks: Task[];
  updated_at?: string;
};

export const PLAN_COLS =
  "id, session_id, plan_date, start_time, session_no, jornada, rival, microcycle, mesocycle, duration_min, contents, observations, score_notes, players, guests, reasons, tasks, updated_at";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newTask(): Task {
  return {
    id: uid(), type: "", code: "", time: "", total: "", space: "", gks: "", description: "", objective: "", rules: "", cues: "",
    teams: "", scoring: "", staff: [{ who: "", role: "", extra: "" }], diagram: { field: "full", els: [] }, image: null,
  };
}

export async function fetchPlans(): Promise<Pick<Plan, "id" | "plan_date" | "start_time" | "rival" | "session_no" | "updated_at">[]> {
  const sb = supabase();
  return fetchAll((f, t) =>
    sb.from("training_plans").select("id, plan_date, start_time, rival, session_no, updated_at").order("plan_date", { ascending: false }).order("id").range(f, t),
  );
}
