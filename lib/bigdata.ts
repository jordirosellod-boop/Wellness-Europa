// Big Data de la lliga: tots els càlculs a partir de les dades públiques de la FCF (partits, actes,
// golejadores i sancions). Funcions pures: no fan cap crida.

import { prettyTeam, rivalKey } from "@/lib/analysis";
import { standings, type GroupMatch } from "@/lib/fcf";
import type { ActaFull, Scorer, Sanction } from "@/lib/fcf-bigdata";

export type BigRaw = {
  us_id: string;
  matches: GroupMatch[];
  actas: Record<string, ActaFull>;
  scorers: Scorer[];
  sanctions: Sanction[];
  pending: number;
  updated_at: string;
  stale_at?: string | null; // si la FCF no respon: de quan són les dades
};

export const PERIODS = ["0-15'", "15-30'", "30-45'", "45-60'", "60-75'", "75-90'"];
const periodOf = (min: number) => Math.min(5, Math.max(0, Math.floor((Math.max(1, min) - 1) / 15)));

export type Split = { pj: number; pts: number; gf: number; gc: number };
export type TeamStat = {
  id: string; name: string; full: string; crest: string | null;
  pos: number; pj: number; g: number; e: number; p: number; gf: number; gc: number; pts: number; ppg: number;
  home: Split; away: Split; cleanSheets: number; failedToScore: number; btts: number; over25: number;
  form: ("G" | "E" | "P")[]; posHistory: { j: number; pos: number }[];
  forBy: number[]; againstBy: number[]; // gols per franja de 15'
  scoredFirst: { n: number; pts: number }; concededFirst: { n: number; pts: number };
  squadUsed: number; topScorer: { name: string; goals: number; share: number } | null; yc: number; rc: number;
  projected: number; // punts projectats a final de lliga
};

export type PlayerStat = {
  id: string; name: string; team_id: string; team: string; crest: string | null; dorsal: string; gk: boolean;
  calls: number; starts: number; goals: number; pens: number; yc: number; rc: number; caps: number;
  teamPj: number; startRate: number; goalsPerCall: number; share: number; recentGoals: number;
  gkConceded: number; gkCleanSheets: number; index: number;
};

export type League = {
  teams: TeamStat[]; players: PlayerStat[]; us: TeamStat | null; totalRounds: number; playedRounds: number;
  avgGoals: number; homeWin: number; draw: number; awayWin: number; forBy: number[]; matchesPlayed: number;
  avgGf: number; topResults: { r: string; n: number }[];
};

/** «COGNOM1 COGNOM2, NOM» → «Nom Cognom1». */
export function prettyPlayer(full: string): string {
  const [sur, given = ""] = full.split(",").map((x) => x.trim());
  const cap = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  const first = cap(given.split(/\s+/)[0] ?? "");
  const last = cap(sur.split(/\s+/)[0] ?? "");
  return [first, last].filter(Boolean).join(" ") || cap(full);
}

const pts = (gf: number, gc: number) => (gf > gc ? 3 : gf === gc ? 1 : 0);

export function compute(raw: BigRaw): League {
  const ms = raw.matches;
  const closed = ms.filter((m) => m.closed && m.home_goals != null && m.away_goals != null);
  const ids = [...new Set(ms.flatMap((m) => [m.home_id, m.away_id]))];
  const nameOf = new Map<string, string>();
  const crestOf = new Map<string, string | null>();
  for (const m of ms) {
    nameOf.set(m.home_id, m.home);
    nameOf.set(m.away_id, m.away);
    if (m.home_crest) crestOf.set(m.home_id, m.home_crest);
    if (m.away_crest) crestOf.set(m.away_id, m.away_crest);
  }
  const crestUrl = (id: string) => (crestOf.get(id) ? `/api/fcf/crest?f=${encodeURIComponent(crestOf.get(id)!)}` : null);
  const table = standings(ms);
  const rounds = [...new Set(ms.map((m) => m.jornada))].sort((a, b) => a - b);
  const played = [...new Set(closed.map((m) => m.jornada))].sort((a, b) => a - b);

  // Posició després de cada jornada
  const hist = new Map<string, { j: number; pos: number }[]>();
  for (const j of played) {
    const t = standings(ms.map((m) => (m.jornada <= j ? m : { ...m, closed: false })));
    for (const r of t) hist.set(r.team_id, [...(hist.get(r.team_id) ?? []), { j, pos: r.pos }]);
  }

  // Equip de cada jugadora de l'acta (els noms de l'acta no porten la lletra «A», «B»…)
  const teamIdIn = (m: GroupMatch, team: string) => {
    const k = rivalKey(team);
    const hk = rivalKey(m.home), ak = rivalKey(m.away);
    if (k === hk) return m.home_id;
    if (k === ak) return m.away_id;
    if (hk.startsWith(k) || k.startsWith(hk)) return m.home_id;
    if (ak.startsWith(k) || k.startsWith(ak)) return m.away_id;
    return null;
  };

  const teams = new Map<string, TeamStat>();
  for (const id of ids) {
    const row = table.find((r) => r.team_id === id);
    const pj = row?.pj ?? 0;
    teams.set(id, {
      id, full: nameOf.get(id) ?? id, name: prettyTeam(nameOf.get(id) ?? id), crest: crestUrl(id),
      pos: row?.pos ?? 0, pj, g: row?.g ?? 0, e: row?.e ?? 0, p: row?.p ?? 0, gf: row?.gf ?? 0, gc: row?.gc ?? 0, pts: row?.pts ?? 0,
      ppg: pj ? (row!.pts / pj) : 0,
      home: { pj: 0, pts: 0, gf: 0, gc: 0 }, away: { pj: 0, pts: 0, gf: 0, gc: 0 }, cleanSheets: 0, failedToScore: 0, btts: 0, over25: 0,
      form: row?.form ?? [], posHistory: hist.get(id) ?? [], forBy: [0, 0, 0, 0, 0, 0], againstBy: [0, 0, 0, 0, 0, 0],
      scoredFirst: { n: 0, pts: 0 }, concededFirst: { n: 0, pts: 0 }, squadUsed: 0, topScorer: null, yc: 0, rc: 0, projected: 0,
    });
  }

  const players = new Map<string, PlayerStat & { dorsals: Map<string, number>; lastJ: number[] }>();
  const squad = new Map<string, Set<string>>();
  for (const m of closed) {
    const hg = m.home_goals!, ag = m.away_goals!;
    const H = teams.get(m.home_id)!, A = teams.get(m.away_id)!;
    for (const [T, gf, gc, side] of [[H, hg, ag, "home"], [A, ag, hg, "away"]] as const) {
      T[side].pj++;
      T[side].gf += gf;
      T[side].gc += gc;
      T[side].pts += pts(gf, gc);
      if (gc === 0) T.cleanSheets++;
      if (gf === 0) T.failedToScore++;
      if (gf > 0 && gc > 0) T.btts++;
      if (gf + gc > 2.5) T.over25++;
    }
    const acta = raw.actas[m.acta_id];
    if (!acta) continue;
    // gols per franja i qui marca primer
    const sorted = [...acta.goals].sort((a, b) => a.minute - b.minute);
    for (const g of sorted) {
      let tid = teamIdIn(m, g.team);
      if (g.kind === "GOL EN PRÒPIA" && tid) tid = tid === m.home_id ? m.away_id : m.home_id; // la llista diu l'equip de qui el marca
      if (!tid) continue;
      const other = tid === m.home_id ? m.away_id : m.home_id;
      teams.get(tid)!.forBy[periodOf(g.minute)]++;
      teams.get(other)!.againstBy[periodOf(g.minute)]++;
    }
    const first = sorted[0];
    if (first) {
      let tid = teamIdIn(m, first.team);
      if (first.kind === "GOL EN PRÒPIA" && tid) tid = tid === m.home_id ? m.away_id : m.home_id;
      if (tid) {
        const other = tid === m.home_id ? m.away_id : m.home_id;
        const [gfT, gcT] = tid === m.home_id ? [hg, ag] : [ag, hg];
        teams.get(tid)!.scoredFirst.n++;
        teams.get(tid)!.scoredFirst.pts += pts(gfT, gcT);
        teams.get(other)!.concededFirst.n++;
        teams.get(other)!.concededFirst.pts += pts(gcT, gfT);
      }
    }
    // jugadores
    for (const p of acta.players) {
      const tid = teamIdIn(m, p.team);
      if (!tid) continue;
      const T = teams.get(tid)!;
      T.yc += p.yc;
      T.rc += p.rc;
      if (!squad.has(tid)) squad.set(tid, new Set());
      squad.get(tid)!.add(p.id);
      const conceded = tid === m.home_id ? ag : hg;
      let s = players.get(p.id);
      if (!s) {
        s = {
          id: p.id, name: prettyPlayer(p.name), team_id: tid, team: T.name, crest: T.crest, dorsal: p.dorsal, gk: false,
          calls: 0, starts: 0, goals: 0, pens: 0, yc: 0, rc: 0, caps: 0, teamPj: 0, startRate: 0, goalsPerCall: 0, share: 0, recentGoals: 0,
          gkConceded: 0, gkCleanSheets: 0, index: 0, dorsals: new Map(), lastJ: [],
        };
        players.set(p.id, s);
      }
      s.team_id = tid; // si canvia d'equip, l'últim
      s.team = T.name;
      s.crest = T.crest;
      s.calls++;
      if (p.titular) s.starts++;
      if (p.cap) s.caps++;
      s.yc += p.yc;
      s.rc += p.rc;
      s.dorsals.set(p.dorsal, (s.dorsals.get(p.dorsal) ?? 0) + 1);
      if (p.gk && p.titular) {
        s.gk = true;
        s.gkConceded += conceded;
        if (conceded === 0) s.gkCleanSheets++;
      }
    }
    for (const g of acta.goals) {
      if (g.kind === "GOL EN PRÒPIA") continue;
      const s = players.get(g.id);
      if (!s) continue;
      s.goals++;
      if (g.kind === "GOL PENAL") s.pens++;
      s.lastJ.push(m.jornada);
    }
  }

  // Totals i índexs
  const lastRounds = played.slice(-3);
  const teamGoals = new Map<string, number>([...teams.values()].map((t) => [t.id, t.gf]));
  const out: PlayerStat[] = [];
  for (const s of players.values()) {
    const T = teams.get(s.team_id)!;
    s.teamPj = T.pj;
    s.dorsal = [...s.dorsals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? s.dorsal;
    s.startRate = T.pj ? Math.min(1, s.starts / T.pj) : 0;
    s.goalsPerCall = s.calls ? s.goals / s.calls : 0;
    s.share = teamGoals.get(s.team_id) ? s.goals / teamGoals.get(s.team_id)! : 0;
    s.recentGoals = s.lastJ.filter((j) => lastRounds.includes(j)).length;
    s.index = playerIndex(s, T);
    const { dorsals: _d, lastJ: _l, ...clean } = s;
    void _d; void _l;
    out.push(clean);
  }
  for (const T of teams.values()) {
    T.squadUsed = squad.get(T.id)?.size ?? 0;
    const top = out.filter((p) => p.team_id === T.id).sort((a, b) => b.goals - a.goals)[0];
    T.topScorer = top && top.goals > 0 ? { name: top.name, goals: top.goals, share: T.gf ? top.goals / T.gf : 0 } : null;
    const total = ms.filter((m) => m.home_id === T.id || m.away_id === T.id).length; // partits de tota la lliga
    T.projected = Math.round(T.ppg * Math.max(T.pj, total));
  }

  const n = closed.length || 1;
  const forBy = [0, 0, 0, 0, 0, 0];
  for (const T of teams.values()) T.forBy.forEach((v, i) => (forBy[i] += v));
  const results = new Map<string, number>();
  for (const m of closed) {
    const r = `${Math.max(m.home_goals!, m.away_goals!)}-${Math.min(m.home_goals!, m.away_goals!)}`;
    results.set(r, (results.get(r) ?? 0) + 1);
  }
  const ts = [...teams.values()].sort((a, b) => a.pos - b.pos || b.pts - a.pts);
  return {
    teams: ts,
    players: out.sort((a, b) => b.index - a.index),
    us: teams.get(raw.us_id) ?? null,
    totalRounds: rounds.length,
    playedRounds: played.length,
    avgGoals: closed.reduce((a, m) => a + m.home_goals! + m.away_goals!, 0) / n,
    homeWin: closed.filter((m) => m.home_goals! > m.away_goals!).length / n,
    draw: closed.filter((m) => m.home_goals === m.away_goals).length / n,
    awayWin: closed.filter((m) => m.home_goals! < m.away_goals!).length / n,
    forBy: forBy.map((v) => v / n),
    matchesPlayed: closed.length,
    avgGf: ts.length ? ts.reduce((a, t) => a + (t.pj ? t.gf / t.pj : 0), 0) / ts.length : 0,
    topResults: [...results.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, k]) => ({ r, n: k })),
  };
}

/**
 * Índex de rendiment (0-100). Jugadores de camp: regularitat (titularitats), gols per partit, pes en els gols
 * de l'equip i nivell de l'equip; resten les expulsions. Porteres: regularitat, porteria a zero i gols encaixats.
 */
export function playerIndex(s: Pick<PlayerStat, "gk" | "starts" | "calls" | "goals" | "rc" | "gkConceded" | "gkCleanSheets"> & { share?: number }, T: Pick<TeamStat, "pj" | "ppg" | "gf">): number {
  const startRate = T.pj ? Math.min(1, s.starts / T.pj) : 0;
  const team = Math.min(1, T.ppg / 3);
  if (s.gk && s.starts > 0) {
    const cs = s.gkCleanSheets / s.starts;
    const gcpm = s.gkConceded / s.starts;
    return Math.round(100 * (0.4 * startRate + 0.3 * cs + 0.2 * Math.max(0, 1 - gcpm / 4) + 0.1 * team));
  }
  const gpc = s.calls ? Math.min(1.5, s.goals / s.calls) / 1.5 : 0;
  const share = T.gf ? Math.min(1, s.goals / T.gf) : 0;
  const v = 0.35 * startRate + 0.35 * gpc + 0.15 * share + 0.15 * team - 0.05 * s.rc;
  return Math.max(0, Math.min(100, Math.round(100 * v)));
}

// ---------------------------------------------------------------------------
// Fitxatges: necessitats de l'equip i candidates per perfil
// ---------------------------------------------------------------------------

export type Need = { key: "gol" | "defensa" | "porteria" | "profunditat"; title: string; why: string };
export type Candidate = { p: PlayerStat; profile: string; reasons: string[]; score: number };

export function needs(L: League): Need[] {
  const us = L.us;
  if (!us || !us.pj) return [];
  const teams = L.teams.filter((t) => t.pj);
  const avg = (f: (t: TeamStat) => number) => teams.reduce((a, t) => a + f(t), 0) / (teams.length || 1);
  const gfpm = us.gf / us.pj, gcpm = us.gc / us.pj;
  const out: Need[] = [];
  if (gfpm < avg((t) => t.gf / t.pj)) out.push({ key: "gol", title: "Gol", why: `Fem ${gfpm.toFixed(1)} gols per partit; la mitjana de la lliga és ${avg((t) => t.gf / t.pj).toFixed(1)}.` });
  if (gcpm > avg((t) => t.gc / t.pj)) out.push({ key: "defensa", title: "Solidesa defensiva", why: `Encaixem ${gcpm.toFixed(1)} per partit; la mitjana és ${avg((t) => t.gc / t.pj).toFixed(1)}.` });
  if (us.cleanSheets / us.pj < avg((t) => t.cleanSheets / t.pj)) out.push({ key: "porteria", title: "Porteria", why: `Porteria a zero en ${us.cleanSheets} de ${us.pj} partits.` });
  if (us.topScorer && us.topScorer.share >= 0.45) out.push({ key: "profunditat", title: "Repartir el gol", why: `${us.topScorer.name} fa el ${Math.round(us.topScorer.share * 100)}% dels nostres gols: dependència alta.` });
  if (!out.length) out.push({ key: "profunditat", title: "Profunditat de plantilla", why: "L'equip està per sobre de la mitjana: buscar jugadores que pugin el nivell sense trencar el grup." });
  return out;
}

export function candidates(L: League): Candidate[] {
  const usId = L.us?.id;
  const pool = L.players.filter((p) => p.team_id !== usId && p.calls >= Math.min(2, L.playedRounds));
  const teamsGc = new Map(L.teams.map((t) => [t.id, t.pj ? t.gc / t.pj : 99]));
  const avgGc = L.teams.reduce((a, t) => a + (t.pj ? t.gc / t.pj : 0), 0) / (L.teams.length || 1);
  const out: Candidate[] = [];
  const add = (p: PlayerStat, profile: string, reasons: string[], score: number) => out.push({ p, profile, reasons, score });

  // Golejadores
  for (const p of pool.filter((x) => !x.gk && x.goals >= 2).sort((a, b) => b.goalsPerCall + b.share * 0.5 - (a.goalsPerCall + a.share * 0.5)).slice(0, 8)) {
    add(p, "Golejadora", [
      `${p.goals} gols en ${p.calls} partits (${p.goalsPerCall.toFixed(2)} per partit)`,
      `Fa el ${Math.round(p.share * 100)}% dels gols de ${p.team}`,
      p.recentGoals ? `${p.recentGoals} gols a les últimes jornades` : "",
    ].filter(Boolean), p.goalsPerCall * 60 + p.share * 40);
  }
  // Porteres
  for (const p of pool.filter((x) => x.gk && x.starts >= Math.min(2, L.playedRounds)).sort((a, b) => b.index - a.index).slice(0, 4)) {
    add(p, "Portera", [`${p.starts} partits de titular`, `${p.gkCleanSheets} porteries a zero`, `${(p.gkConceded / p.starts).toFixed(1)} gols encaixats per partit`], p.index);
  }
  // Fixes d'una defensa sòlida (l'acta no diu la posició: titulars indiscutibles d'equips que encaixen poc i que gairebé no marquen)
  for (const p of pool.filter((x) => !x.gk && x.startRate >= 0.85 && x.goals <= 1 && (teamsGc.get(x.team_id) ?? 99) <= avgGc).sort((a, b) => (teamsGc.get(a.team_id)! - teamsGc.get(b.team_id)!) || b.starts - a.starts).slice(0, 6)) {
    add(p, "Fixa de bloc", [`Titular en ${p.starts} de ${p.teamPj} partits`, `${p.team} encaixa ${(teamsGc.get(p.team_id) ?? 0).toFixed(1)} per partit`, "Posició a confirmar (l'acta no la diu)"], 50 + p.startRate * 30);
  }
  // Molt rendiment amb pocs minuts
  for (const p of pool.filter((x) => !x.gk && x.startRate < 0.6 && x.goals >= 2).sort((a, b) => b.goalsPerCall - a.goalsPerCall).slice(0, 5)) {
    add(p, "Poc protagonisme", [`Només ${p.starts} titularitats de ${p.teamPj} partits`, `Però ${p.goals} gols`, "Potser busca minuts"], 40 + p.goalsPerCall * 40);
  }
  // En ratxa
  for (const p of pool.filter((x) => x.recentGoals >= 2).sort((a, b) => b.recentGoals - a.recentGoals).slice(0, 5)) {
    if (out.some((c) => c.p.id === p.id && c.profile === "Golejadora")) continue;
    add(p, "En ratxa", [`${p.recentGoals} gols a les 3 últimes jornades`, `${p.team}`], 30 + p.recentGoals * 10);
  }
  return out;
}
