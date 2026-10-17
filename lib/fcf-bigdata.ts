// Big Data de la lliga: lectura completa de les actes de la FCF (tots dos equips) i altres dades públiques.
// Només dades públiques de la federació. Les fa servir el servidor (no el navegador).

import { extractPayload, FCF_BASE } from "@/lib/fcf";

const UA = "Mozilla/5.0 (compatible; WellnessCEEuropa/1.0)";

export type ActaPlayerFull = { id: string; name: string; dorsal: string; titular: boolean; gk: boolean; cap: boolean; team: string; yc: number; rc: number };
export type ActaGoalFull = { id: string; name: string; team: string; minute: number; kind: "GOL" | "GOL PENAL" | "GOL EN PRÒPIA" };
export type ActaFull = { players: ActaPlayerFull[]; goals: ActaGoalFull[] };

/** Llegeix l'acta sencera: alineacions (titulars i suplents) i targetes de tots dos equips, i tots els gols. */
export function parseActaFull(payload: string): ActaFull {
  const lineupRe =
    /"player":\{"id":"(\d+)","nombre":"((?:[^"\\]|\\.)*)","dorsal":"([^"]*)","titular":"(\d)","capitan":"(\d)","portero":(\d)\},"teamName":"((?:[^"\\]|\\.)*)"/g;
  const found: { m: RegExpExecArray; start: number; end: number }[] = [];
  for (let m = lineupRe.exec(payload); m; m = lineupRe.exec(payload)) found.push({ m, start: m.index, end: lineupRe.lastIndex });
  const players = new Map<string, ActaPlayerFull>();
  found.forEach(({ m, end }, i) => {
    // Les targetes surten com a icones de colors just després de la jugadora (fins a la següent).
    const seg = payload.slice(end, Math.min(found[i + 1]?.start ?? end + 4000, end + 4000));
    const yc = (seg.match(/bg-\[#FFEB3B\]/g) ?? []).length; // groga
    const rc = (seg.match(/bg-\[#F30000\]/g) ?? []).length; // vermella / doble groga
    const prev = players.get(m[1]);
    const p: ActaPlayerFull = {
      id: m[1], name: JSON.parse(`"${m[2]}"`) as string, dorsal: m[3], titular: m[4] === "1", cap: m[5] === "1", gk: m[6] === "1",
      team: JSON.parse(`"${m[7]}"`) as string, yc: Math.min(2, yc), rc: Math.min(1, rc),
    };
    players.set(m[1], prev ? { ...p, titular: prev.titular || p.titular, yc: Math.max(prev.yc, p.yc), rc: Math.max(prev.rc, p.rc) } : p);
  });
  const goals: ActaGoalFull[] = [];
  const goalRe =
    /"player":\{"id":"(\d+)","nombre":"((?:[^"\\]|\\.)*)","dorsal":"[^"]*"\},"teamName":"((?:[^"\\]|\\.)*)"[\s\S]{0,600}?\["\(","(GOL EN PRÒPIA|GOL PENAL|GOL)"," ","\((\d+)'\)"/g;
  for (let m = goalRe.exec(payload); m; m = goalRe.exec(payload)) {
    goals.push({ id: m[1], name: JSON.parse(`"${m[2]}"`) as string, team: JSON.parse(`"${m[3]}"`) as string, kind: m[4] as ActaGoalFull["kind"], minute: Number(m[5]) });
  }
  return { players: [...players.values()], goals };
}

export async function fetchActaFull(actaId: string): Promise<ActaFull> {
  const res = await fetch(`${FCF_BASE}/ca/competicio/acta/${encodeURIComponent(actaId)}`, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`FCF acta ${actaId}: ${res.status}`);
  return parseActaFull(extractPayload(await res.text()));
}

export type Scorer = { id: string; name: string; team_id: string; team: string; goals: number; penalties: number; crest: string | null };
export async function fetchScorers(grupId: string): Promise<Scorer[]> {
  const res = await fetch(`${FCF_BASE}/api/competition/goleadores?grupId=${encodeURIComponent(grupId)}`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const raw = (await res.json()) as { codjugador: string; nombre_jugador: string; codequipo: string; nombre_equipo: string; goles: number; penalti: number; escudo?: string }[];
  return raw.map((r) => ({ id: String(r.codjugador), name: r.nombre_jugador, team_id: String(r.codequipo), team: r.nombre_equipo, goals: Number(r.goles) || 0, penalties: Number(r.penalti) || 0, crest: r.escudo ?? null }));
}

export type Sanction = { jornada: number; name: string; team: string | null; matches: number; reason: string; acta: string | null };
export async function fetchSanctions(grupId: string): Promise<Sanction[]> {
  const res = await fetch(`${FCF_BASE}/api/competition/sanciones?grupId=${encodeURIComponent(grupId)}`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const raw = (await res.json()) as Record<string, { participante_nombre?: string; nombre_equipo?: string; equipo_nombre?: string; partidos_sancion?: string; motivo_sancion?: string; codacta?: string; tipo?: string }[]>;
  const out: Sanction[] = [];
  for (const [j, list] of Object.entries(raw)) {
    for (const s of list ?? []) {
      if (s.tipo && s.tipo !== "participante") continue;
      out.push({
        jornada: Number(j), name: s.participante_nombre ?? "—", team: s.nombre_equipo ?? s.equipo_nombre ?? null,
        matches: Number(s.partidos_sancion) || 0, reason: (s.motivo_sancion ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").slice(0, 300),
        acta: s.codacta ?? null,
      });
    }
  }
  return out;
}
