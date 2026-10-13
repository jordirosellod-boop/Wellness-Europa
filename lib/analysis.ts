// Anàlisi de partits (només qui la fa). El vídeo es queda al dispositiu; aquí hi ha les marques.

import { fetchAll, supabase } from "@/lib/supabase";

export type AMatch = {
  id: string;
  convocation_id: string | null;
  title: string;
  match_date: string;
  rival: string | null;
  is_home: boolean;
  goals_for: number | null;
  goals_against: number | null;
  video_source: "file" | "youtube" | null;
  video_ref: string | null;
  video_offset: number;
  video_offset_h2: number | null;
  h1_start: number;
  h2_start: number | null;
  notes: string | null;
};
export const AMATCH_COLS =
  "id, convocation_id, title, match_date, rival, is_home, goals_for, goals_against, video_source, video_ref, video_offset, video_offset_h2, h1_start, h2_start, notes";

export type AEvent = {
  id: string;
  match_id: string;
  t: number;
  pre_s: number;
  post_s: number;
  action: string;
  category: string | null;
  color: string | null;
  team: "us" | "rival";
  player_id: string | null;
  result: "ok" | "ko" | null;
  zx: number | null;
  zy: number | null;
  notes: string | null;
  drawing: unknown[] | null;
};
export const AEVENT_COLS = "id, match_id, t, pre_s, post_s, action, category, color, team, player_id, result, zx, zy, notes, drawing";

export type AButton = {
  id: string;
  label: string;
  category: string | null;
  color: string;
  pre_s: number;
  post_s: number;
  ask_player: boolean;
  ask_result: boolean;
  ask_zone: boolean;
  sort: number;
};
export const ABUTTON_COLS = "id, label, category, color, pre_s, post_s, ask_player, ask_result, ask_zone, sort";

/** Panell inicial (es pot canviar tot). */
export const DEFAULT_BUTTONS: Omit<AButton, "id">[] = [
  { label: "Gol", category: "Finalització", color: "#1e7d3a", pre_s: 12, post_s: 6, ask_player: true, ask_result: false, ask_zone: true },
  { label: "Xut", category: "Finalització", color: "#d32f2f", pre_s: 8, post_s: 4, ask_player: true, ask_result: true, ask_zone: true },
  { label: "Ocasió", category: "Finalització", color: "#e65100", pre_s: 10, post_s: 4, ask_player: true, ask_result: false, ask_zone: true },
  { label: "Recuperació", category: "Defensa", color: "#0a2ea0", pre_s: 5, post_s: 6, ask_player: true, ask_result: false, ask_zone: true },
  { label: "Pèrdua", category: "Atac", color: "#8e24aa", pre_s: 6, post_s: 6, ask_player: true, ask_result: false, ask_zone: true },
  { label: "Duel", category: "Defensa", color: "#00838f", pre_s: 4, post_s: 3, ask_player: true, ask_result: true, ask_zone: true },
  { label: "Passada clau", category: "Atac", color: "#2e7d32", pre_s: 6, post_s: 4, ask_player: true, ask_result: false, ask_zone: true },
  { label: "Centre", category: "Atac", color: "#5d4037", pre_s: 6, post_s: 4, ask_player: true, ask_result: true, ask_zone: true },
  { label: "Pressió", category: "Defensa", color: "#455a64", pre_s: 4, post_s: 6, ask_player: false, ask_result: true, ask_zone: true },
  { label: "Sortida de pilota", category: "Atac", color: "#1565c0", pre_s: 2, post_s: 12, ask_player: false, ask_result: true, ask_zone: false },
  { label: "Transició ofensiva", category: "Transició", color: "#f9a825", pre_s: 3, post_s: 10, ask_player: false, ask_result: true, ask_zone: false },
  { label: "Transició defensiva", category: "Transició", color: "#6d4c41", pre_s: 3, post_s: 10, ask_player: false, ask_result: true, ask_zone: false },
  { label: "Córner", category: "ABP", color: "#283593", pre_s: 3, post_s: 10, ask_player: false, ask_result: true, ask_zone: false },
  { label: "Falta", category: "ABP", color: "#ad1457", pre_s: 5, post_s: 5, ask_player: true, ask_result: false, ask_zone: true },
  { label: "Fora de joc", category: "Altres", color: "#757575", pre_s: 6, post_s: 3, ask_player: true, ask_result: false, ask_zone: false },
  { label: "Targeta", category: "Altres", color: "#fbc02d", pre_s: 8, post_s: 4, ask_player: true, ask_result: false, ask_zone: false },
].map((b, i) => ({ ...b, sort: i }));

/** Rellotge (segons) → posició al vídeo, tenint en compte el desfasament de cada part. */
export function toVideo(m: AMatch, t: number): number {
  const off = m.h2_start != null && t >= m.h2_start && m.video_offset_h2 != null ? m.video_offset_h2 : m.video_offset;
  return Math.max(0, t + Number(off));
}
/** Posició al vídeo → rellotge (segons). */
export function fromVideo(m: AMatch, v: number): number {
  if (m.h2_start != null && m.video_offset_h2 != null && v - Number(m.video_offset_h2) >= Number(m.h2_start)) return Math.max(0, v - Number(m.video_offset_h2));
  return Math.max(0, v - Number(m.video_offset));
}
/** Part (1 o 2) d'un moment del rellotge. */
export const halfOf = (m: AMatch, t: number) => (m.h2_start != null && t >= Number(m.h2_start) ? 2 : 1);
/** Minut de partit ("12'", "45+2'", "67'"). */
export function minuteOf(m: AMatch, t: number): string {
  const h = halfOf(m, t);
  const s = h === 2 ? t - Number(m.h2_start) : t - Number(m.h1_start);
  const mins = Math.floor(Math.max(0, s) / 60);
  if (h === 1 && mins >= 45 && m.h2_start == null) return `${mins + 1}'`;
  return h === 1 ? `${mins + 1}'` : `${45 + mins + 1}'`;
}
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export async function fetchAMatches(): Promise<AMatch[]> {
  const sb = supabase();
  return fetchAll<AMatch>((f, t) => sb.from("analysis_matches").select(AMATCH_COLS).order("match_date", { ascending: false }).order("id").range(f, t));
}
export async function fetchAEvents(matchId: string): Promise<AEvent[]> {
  const sb = supabase();
  const rows = await fetchAll<AEvent>((f, t) => sb.from("analysis_events").select(AEVENT_COLS).eq("match_id", matchId).order("t").order("id").range(f, t));
  return rows.map((r) => ({ ...r, t: Number(r.t), zx: r.zx == null ? null : Number(r.zx), zy: r.zy == null ? null : Number(r.zy) }));
}
export async function fetchButtons(): Promise<AButton[]> {
  const sb = supabase();
  return fetchAll<AButton>((f, t) => sb.from("analysis_buttons").select(ABUTTON_COLS).order("sort").order("id").range(f, t));
}

/** Treu l'identificador d'un enllaç de YouTube (watch, youtu.be, shorts, live). */
export function youtubeId(url: string): string | null {
  const m = url.trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}
