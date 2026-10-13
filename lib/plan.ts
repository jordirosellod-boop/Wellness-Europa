// Plantilla d'entrenament (privada de qui la fa): tipus i dades.

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
export type El =
  | { id: string; t: "player"; x: number; y: number; team: Team; label?: string }
  | { id: string; t: "cone" | "ball" | "minigoal" | "goal"; x: number; y: number }
  | { id: string; t: "arrow"; x: number; y: number; x2: number; y2: number; kind: ArrowKind };
export type Diagram = { field: Field; els: El[] };

export type StaffRole = { who: string; role: string; extra: string };

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
  teams: string;
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
  tasks: Task[];
  updated_at?: string;
};

export const PLAN_COLS =
  "id, session_id, plan_date, start_time, session_no, jornada, rival, microcycle, mesocycle, duration_min, contents, observations, score_notes, players, tasks, updated_at";

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
