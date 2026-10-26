// Resum d'un rival per a la fitxa dels talls de vídeo: classificació, ratxa, últims partits i golejadores.
// Es calcula amb les dades de la FCF (partits del grup i golejadores). Sense dades personals més enllà
// del que publica la FCF (nom i gols).

import { standings, type GroupMatch } from "@/lib/fcf";
import type { ActaFull, Scorer } from "@/lib/fcf-bigdata";

export type Res = "G" | "E" | "P";
export type RivalGame = { jornada: number; date: string | null; opp: string; opp_crest: string | null; home: boolean; gf: number; ga: number; res: Res };
export type RivalSummary = {
  team_id: string;
  name: string;
  crest: string | null; // fitxer de l'escut a la FCF
  pos: number | null;
  teams: number;
  pts: number; pj: number; g: number; e: number; p: number; gf: number; gc: number;
  form: Res[];
  home: { g: number; e: number; p: number };
  away: { g: number; e: number; p: number };
  clean_sheets: number;
  last: RivalGame[]; // els 5 últims, del més recent al més antic
  vs_us: RivalGame[]; // contra nosaltres aquesta temporada
  scorers: { name: string; goals: number; penalties: number }[]; // les 4 que més marquen
  team_goals_by_top: number; // % dels gols de l'equip que fa la màxima golejadora
  stale_at: string | null;
};

const strip = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/,?\s+(c\.e\.|u\.e\.|c\.f\.|a\.d\.|c\.d\.|u\.d\.|f\.c\.)\s*/g, " ")
    .replace(/\s+[a-z]$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Troba l'equip pel nom (tolerant: «Premià Dalt» = «PREMIA DALT, C.D. A»). */
export function findTeam(all: GroupMatch[], name: string): { id: string; name: string; crest: string | null } | null {
  const k = strip(name);
  if (!k) return null;
  const teams = new Map<string, { id: string; name: string; crest: string | null }>();
  for (const m of all) {
    if (!teams.has(m.home_id)) teams.set(m.home_id, { id: m.home_id, name: m.home, crest: m.home_crest ?? null });
    if (!teams.has(m.away_id)) teams.set(m.away_id, { id: m.away_id, name: m.away, crest: m.away_crest ?? null });
  }
  const list = [...teams.values()].filter((t) => !/^descans/i.test(t.name));
  return list.find((t) => strip(t.name) === k) ?? list.find((t) => strip(t.name).startsWith(k) || k.startsWith(strip(t.name))) ?? list.find((t) => strip(t.name).includes(k)) ?? null;
}

/**
 * Golejadores de l'equip comptades a les actes (si les tenim totes; si no, null).
 * Els gols en pròpia no compten per a la jugadora.
 */
export function scorersFromActas(all: GroupMatch[], actas: Map<string, ActaFull>, teamId: string): Scorer[] | null {
  const mine = all.filter((m) => m.closed && (m.home_id === teamId || m.away_id === teamId));
  if (!mine.length || mine.some((m) => !actas.has(m.acta_id))) return null;
  const tally = new Map<string, Scorer>();
  for (const m of mine) {
    const ours = strip(m.home_id === teamId ? m.home : m.away);
    for (const g of actas.get(m.acta_id)!.goals) {
      const k = strip(g.team);
      if (g.kind === "GOL EN PRÒPIA" || !(k === ours || ours.startsWith(k) || k.startsWith(ours))) continue;
      const cur = tally.get(g.id) ?? { id: g.id, name: g.name, team_id: teamId, team: g.team, goals: 0, penalties: 0, crest: null };
      cur.goals++;
      if (g.kind === "GOL PENAL") cur.penalties++;
      tally.set(g.id, cur);
    }
  }
  return [...tally.values()];
}

export function rivalSummary(all: GroupMatch[], official: Scorer[], name: string, usId: string, staleAt: string | null, actas?: Map<string, ActaFull>): RivalSummary | null {
  const t = findTeam(all, name);
  if (!t) return null;
  const scorers = (actas && scorersFromActas(all, actas, t.id)) || official;
  const table = standings(all.filter((m) => !/^descans/i.test(m.home) && !/^descans/i.test(m.away)));
  const row = table.find((r) => r.team_id === t.id);
  const played = all
    .filter((m) => m.closed && m.home_goals != null && m.away_goals != null && (m.home_id === t.id || m.away_id === t.id))
    .sort((a, b) => b.jornada - a.jornada);
  const game = (m: GroupMatch): RivalGame => {
    const home = m.home_id === t.id;
    const gf = home ? m.home_goals! : m.away_goals!, ga = home ? m.away_goals! : m.home_goals!;
    return {
      jornada: m.jornada, date: m.kickoff?.slice(0, 10) ?? null, opp: home ? m.away : m.home, opp_crest: (home ? m.away_crest : m.home_crest) ?? null,
      home, gf, ga, res: gf > ga ? "G" : gf < ga ? "P" : "E",
    };
  };
  const games = played.map(game);
  const split = (h: boolean) => {
    const l = games.filter((x) => x.home === h);
    return { g: l.filter((x) => x.res === "G").length, e: l.filter((x) => x.res === "E").length, p: l.filter((x) => x.res === "P").length };
  };
  const mine = scorers.filter((s) => s.team_id === t.id).sort((a, b) => b.goals - a.goals);
  const gf = row?.gf ?? 0;
  return {
    team_id: t.id,
    name: t.name,
    crest: t.crest,
    pos: row?.pj ? row.pos : null,
    teams: table.length,
    pts: row?.pts ?? 0, pj: row?.pj ?? 0, g: row?.g ?? 0, e: row?.e ?? 0, p: row?.p ?? 0, gf, gc: row?.gc ?? 0,
    form: [...games].reverse().slice(-5).map((x) => x.res),
    home: split(true),
    away: split(false),
    clean_sheets: games.filter((x) => x.ga === 0).length,
    last: games.slice(0, 5),
    vs_us: played.filter((m) => m.home_id === usId || m.away_id === usId).map(game),
    scorers: mine.slice(0, 4).map((s) => ({ name: s.name, goals: s.goals, penalties: s.penalties })),
    team_goals_by_top: mine[0] && gf ? Math.round((mine[0].goals / gf) * 100) : 0,
    stale_at: staleAt,
  };
}
