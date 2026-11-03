// Informe automàtic del rival: tot a partir de les dades públiques de la FCF d'aquesta temporada
// (partits, actes amb alineacions, gols i targetes, golejadores i sancions). Funcions pures, sense crides.

import { rivalKey } from "@/lib/analysis";
import { PERIODS, type BigRaw, type League, type PlayerStat, type TeamStat } from "@/lib/bigdata";
import { normalize, type GroupMatch } from "@/lib/fcf";

export type RMatch = { j: number; date: string | null; home: boolean; opp: string; oppId: string; gf: number; gc: number; res: "G" | "E" | "P" };
export type RPlayer = PlayerStat & { lastStart: boolean; inLast: boolean; newcomer: boolean; missingRegular: boolean; sanction: string | null };
export type RivalReport = {
  team: TeamStat; us: TeamStat | null; league: League;
  next: { date: string | null; j: number; rivalHome: boolean } | null;
  matches: RMatch[];
  headToHead: { j: number; usGoals: number; themGoals: number; home: boolean } | null;
  common: { opp: string; them: string; us: string }[];
  players: RPlayer[]; keepers: RPlayer[]; xi: RPlayer[]; lastXi: RPlayer[];
  periodsFor: number[]; periodsAgainst: number[];
  summary: string[]; strengths: string[]; weaknesses: string[]; keys: string[]; watch: string[];
};

const res = (gf: number, gc: number): "G" | "E" | "P" => (gf > gc ? "G" : gf === gc ? "E" : "P");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const n1 = (x: number) => x.toFixed(1).replace(".", ",");
const sameTeam = (a: string, b: string) => { const x = rivalKey(a), y = rivalKey(b); return x === y || x.startsWith(y) || y.startsWith(x); };

/** El proper rival (el primer partit nostre encara no jugat). */
export function nextRival(raw: BigRaw): { id: string; match: GroupMatch } | null {
  const mine = raw.matches.filter((m) => !m.closed && (m.home_id === raw.us_id || m.away_id === raw.us_id))
    .sort((a, b) => a.jornada - b.jornada || String(a.kickoff).localeCompare(String(b.kickoff)));
  const m = mine[0];
  return m ? { id: m.home_id === raw.us_id ? m.away_id : m.home_id, match: m } : null;
}

export function buildReport(L: League, raw: BigRaw, teamId: string): RivalReport | null {
  const T = L.teams.find((t) => t.id === teamId);
  if (!T) return null;
  const us = L.us;
  const closed = raw.matches.filter((m) => m.closed && m.home_goals != null && m.away_goals != null);
  const mine = (id: string) => closed.filter((m) => m.home_id === id || m.away_id === id).sort((a, b) => a.jornada - b.jornada);
  const toR = (m: GroupMatch, id: string): RMatch => {
    const home = m.home_id === id;
    const gf = home ? m.home_goals! : m.away_goals!, gc = home ? m.away_goals! : m.home_goals!;
    return { j: m.jornada, date: m.kickoff, home, opp: home ? m.away : m.home, oppId: home ? m.away_id : m.home_id, gf, gc, res: res(gf, gc) };
  };
  const matches = mine(teamId).map((m) => toR(m, teamId));
  const ourMatches = us ? mine(us.id).map((m) => toR(m, us.id)) : [];

  // Proper partit contra nosaltres
  const nm = raw.matches.find((m) => !m.closed && ((m.home_id === teamId && m.away_id === raw.us_id) || (m.away_id === teamId && m.home_id === raw.us_id)));
  const next = nm ? { date: nm.kickoff, j: nm.jornada, rivalHome: nm.home_id === teamId } : null;
  const h2h = closed.find((m) => (m.home_id === teamId && m.away_id === raw.us_id) || (m.away_id === teamId && m.home_id === raw.us_id));
  const headToHead = h2h ? { j: h2h.jornada, home: h2h.home_id === raw.us_id, usGoals: h2h.home_id === raw.us_id ? h2h.home_goals! : h2h.away_goals!, themGoals: h2h.home_id === raw.us_id ? h2h.away_goals! : h2h.home_goals! } : null;

  // Rivals comuns: com els va anar a ells i a nosaltres
  const common = matches.filter((m) => m.oppId !== raw.us_id).flatMap((m) => {
    const o = ourMatches.filter((x) => x.oppId === m.oppId);
    return o.length ? [{ opp: L.teams.find((t) => t.id === m.oppId)?.name ?? m.opp, them: `${m.gf}-${m.gc} ${m.home ? "(c)" : "(f)"}`, us: o.map((x) => `${x.gf}-${x.gc} ${x.home ? "(c)" : "(f)"}`).join(", ") }] : [];
  });

  // Jugadores: el darrer partit, novetats i habituals que no hi eren
  const actaOf = (m: RMatch) => raw.actas[closed.find((c) => c.jornada === m.j && (c.home_id === teamId || c.away_id === teamId))?.acta_id ?? ""];
  const last = matches.at(-1);
  const lastActa = last ? actaOf(last) : undefined;
  const lastSide = lastActa?.players.filter((p) => sameTeam(p.team, T.full)) ?? [];
  const lastIds = new Set(lastSide.map((p) => p.id));
  const lastStarters = new Set(lastSide.filter((p) => p.titular).map((p) => p.id));
  const earlier = new Set(matches.slice(0, -2).flatMap((m) => actaOf(m)?.players.filter((p) => sameTeam(p.team, T.full)).map((p) => p.id) ?? []));
  // Sanció vigent: la de la jornada més recent amb el seu nom i cognom
  const recentJ = Math.max(0, ...matches.map((m) => m.j));
  const sanctionOf = (name: string) => {
    const words = normalize(name).split(" ").filter((w) => w.length > 1);
    const s = raw.sanctions.filter((x) => (x.team ? sameTeam(x.team, T.full) : true) && x.matches > 0 && x.jornada >= recentJ - 1
      && words.every((w) => normalize(x.name).split(" ").includes(w)))
      .sort((a, b) => b.jornada - a.jornada)[0];
    return s ? `${s.matches} partit${s.matches === 1 ? "" : "s"} (${s.reason || "sanció"})` : null;
  };
  const players: RPlayer[] = L.players.filter((p) => p.team_id === teamId).map((p) => ({
    ...p,
    lastStart: lastStarters.has(p.id),
    inLast: lastIds.has(p.id),
    newcomer: matches.length > 3 && !earlier.has(p.id),
    missingRegular: !!last && p.startRate >= 0.6 && !lastIds.has(p.id),
    sanction: sanctionOf(p.name),
  })).sort((a, b) => b.starts - a.starts || b.calls - a.calls || b.goals - a.goals);
  const keepers = players.filter((p) => p.gk).sort((a, b) => b.starts - a.starts);
  const field = players.filter((p) => !p.gk);
  const xi = [...keepers.slice(0, 1), ...field.slice(0, 10)];
  const lastXi = [...players.filter((p) => p.lastStart && p.gk), ...players.filter((p) => p.lastStart && !p.gk)];

  // ---------- Frases ----------
  const lg = L.teams.filter((t) => t.pj > 0);
  const avgGf = lg.reduce((a, t) => a + t.gf / t.pj, 0) / (lg.length || 1);
  const avgGc = avgGf;
  const gfpg = T.pj ? T.gf / T.pj : 0, gcpg = T.pj ? T.gc / T.pj : 0;
  const summary: string[] = [], strengths: string[] = [], weaknesses: string[] = [], keys: string[] = [], watch: string[] = [];

  const ph = T.posHistory;
  const trend = ph.length >= 4 ? ph[ph.length - 4].pos - T.pos : 0;
  summary.push(`${T.pos}a classificada amb ${T.pts} punts en ${T.pj} partits (${T.g}V ${T.e}E ${T.p}D), ${n1(T.ppg)} punts per partit.${trend >= 2 ? ` Ve de pujar ${trend} llocs en les últimes jornades.` : trend <= -2 ? ` Ha baixat ${-trend} llocs en les últimes jornades.` : ""}`);
  if (T.form.length) {
    const f = T.form.slice(-5);
    const w = f.filter((x) => x === "G").length, l = f.filter((x) => x === "P").length;
    summary.push(`Ratxa (últims ${f.length}): ${f.join(" ")}${w >= 4 ? " — arriba en molt bon moment." : l >= 3 ? " — arriba en mala dinàmica." : "."}`);
  }
  summary.push(`Marca ${n1(gfpg)} gols per partit i n'encaixa ${n1(gcpg)} (la mitjana de la lliga és ${n1(avgGf)}).`);
  if (next) {
    const s = next.rivalHome ? T.home : T.away;
    if (s.pj) summary.push(`${next.rivalHome ? "A casa seva" : "Fora de casa"}: ${n1(s.pts / s.pj)} punts per partit, ${n1(s.gf / s.pj)} gols a favor i ${n1(s.gc / s.pj)} en contra.`);
  }
  if (T.pj < 5) summary.push(`Compte: només hi ha ${T.pj} partits jugats, les tendències encara poden canviar.`);
  if (headToHead) summary.push(`A l'anada (J${headToHead.j}) va acabar ${headToHead.usGoals}-${headToHead.themGoals} per a nosaltres ${headToHead.usGoals > headToHead.themGoals ? "(victòria)" : headToHead.usGoals === headToHead.themGoals ? "(empat)" : "(derrota)"}.`);

  if (gfpg >= avgGf * 1.3) strengths.push(`Molt golejadores: ${n1(gfpg)} gols per partit, de les més altes de la lliga.`);
  if (gcpg <= avgGc * 0.7) strengths.push(`Defensa molt sòlida: només ${n1(gcpg)} gols encaixats per partit.`);
  if (T.cleanSheets >= Math.max(2, T.pj * 0.35)) strengths.push(`Porteria a zero en ${T.cleanSheets} de ${T.pj} partits.`);
  if (T.home.pj && T.home.pts / T.home.pj >= 2.2) strengths.push(`Molt fortes a casa (${n1(T.home.pts / T.home.pj)} punts per partit).`);
  if (T.away.pj && T.away.pts / T.away.pj >= 2) strengths.push(`També guanyen fora (${n1(T.away.pts / T.away.pj)} punts per partit lluny de casa).`);
  if (T.concededFirst.n >= 2 && T.concededFirst.pts / T.concededFirst.n >= 1.2) strengths.push(`No es rendeixen: quan encaixen primer encara treuen ${n1(T.concededFirst.pts / T.concededFirst.n)} punts per partit.`);
  if (gfpg <= avgGf * 0.75) weaknesses.push(`Els costa marcar: ${n1(gfpg)} gols per partit i ${T.failedToScore} partits sense marcar.`);
  if (gcpg >= avgGc * 1.3) weaknesses.push(`Encaixen molt: ${n1(gcpg)} gols per partit.`);
  if (T.away.pj && T.away.pts / T.away.pj <= 0.8) weaknesses.push(`Fluixes fora de casa (${n1(T.away.pts / T.away.pj)} punts per partit).`);
  if (T.home.pj && T.home.pts / T.home.pj <= 1) weaknesses.push(`A casa no són fortes (${n1(T.home.pts / T.home.pj)} punts per partit).`);
  if (T.concededFirst.n >= 2 && T.concededFirst.pts / T.concededFirst.n < 0.5) weaknesses.push(`Quan encaixen primer, gairebé mai remunten (${n1(T.concededFirst.pts / T.concededFirst.n)} punts per partit).`);

  // Quan marquen i quan encaixen
  const totF = T.forBy.reduce((a, b) => a + b, 0), totA = T.againstBy.reduce((a, b) => a + b, 0);
  if (totF >= 4) {
    const i = T.forBy.indexOf(Math.max(...T.forBy));
    const late = T.forBy[4] + T.forBy[5];
    if (T.forBy[i] >= 2) strengths.push(`On més marquen: ${PERIODS[i]} (${pct(T.forBy[i], totF)}% dels seus gols).${late >= 3 && pct(late, totF) >= 40 ? ` I el ${pct(late, totF)}% als últims 30 minuts: aguanten bé físicament.` : ""}`);
  }
  if (totA >= 4) {
    const i = T.againstBy.indexOf(Math.max(...T.againstBy));
    if (T.againstBy[i] >= 2) weaknesses.push(`On més encaixen: ${PERIODS[i]} (${pct(T.againstBy[i], totA)}% dels gols en contra).`);
    if (T.againstBy[0] >= 2 && T.againstBy[0] >= totA * 0.25) keys.push(`Sortir fort: encaixen molts gols al primer quart d'hora (${T.againstBy[0]}).`);
    if (T.againstBy[4] + T.againstBy[5] >= 3 && T.againstBy[4] + T.againstBy[5] >= totA * 0.4) keys.push(`Apretar al final: el ${pct(T.againstBy[4] + T.againstBy[5], totA)}% dels gols que encaixen són als últims 30 minuts.`);
  }
  if (T.scoredFirst.n >= 2) keys.push(`El primer gol pesa molt: quan marquen primer fan ${n1(T.scoredFirst.pts / T.scoredFirst.n)} punts per partit${T.concededFirst.n ? `, quan l'encaixen, ${n1(T.concededFirst.pts / T.concededFirst.n)}` : ""}.`);

  // Dependència i plantilla
  if (T.topScorer && T.topScorer.share >= 0.35 && T.topScorer.goals >= 3) {
    weaknesses.push(`Depenen molt de ${T.topScorer.name}: ${T.topScorer.goals} gols, el ${pct(T.topScorer.goals, T.gf)}% de l'equip.`);
    keys.push(`Vigilar ${T.topScorer.name} (${T.topScorer.goals} gols): si la tapem, els costarà molt marcar.`);
  }
  const scorersN = players.filter((p) => p.goals > 0).length;
  if (scorersN >= 7) strengths.push(`Gol repartit: ${scorersN} jugadores diferents han marcat.`);
  const core = players.filter((p) => p.startRate >= 0.75).length;
  summary.push(`Han fet servir ${T.squadUsed} jugadores; ${core} són titulars fixes (3 de cada 4 partits o més).`);
  if (T.squadUsed >= 22) summary.push(`Roten molt: és difícil preveure l'onze.`);
  if (T.pj >= 3 && T.yc + T.rc * 2 >= T.pj * 2.5) weaknesses.push(`Equip amb moltes targetes (${T.yc} grogues i ${T.rc} vermelles): perden els nervis.`);

  // A qui vigilar
  for (const p of field.filter((x) => x.goals >= 2).sort((a, b) => b.goals - a.goals).slice(0, 4)) {
    watch.push(`${p.dorsal ? `${p.dorsal} · ` : ""}${p.name}: ${p.goals} gols en ${p.calls} partits${p.pens ? ` (${p.pens} de penal)` : ""}${p.recentGoals ? `, ${p.recentGoals} en les últimes 3 jornades — està en ratxa` : ""}.`);
  }
  if (keepers[0]) {
    const k = keepers[0];
    watch.push(`Portera habitual: ${k.dorsal ? `${k.dorsal} · ` : ""}${k.name} (${k.starts} partits, ${k.gkConceded} gols encaixats, ${k.gkCleanSheets} a zero).`);
  }
  const absent = players.filter((p) => p.missingRegular);
  if (absent.length) watch.push(`Habituals que no van jugar l'últim partit: ${absent.map((p) => p.name).join(", ")} (lesió, sanció o descans?).`);
  const sanctioned = players.filter((p) => p.sanction);
  if (sanctioned.length) watch.push(`Sancions a la FCF: ${sanctioned.map((p) => `${p.name} (${p.sanction})`).join(", ")}.`);
  const fresh = players.filter((p) => p.newcomer && p.calls > 0);
  if (fresh.length) watch.push(`Cares noves de les últimes jornades: ${fresh.map((p) => p.name).join(", ")}.`);

  if (next) keys.push(next.rivalHome
    ? `Juguem al seu camp: ${T.home.pj ? `hi fan ${n1(T.home.pts / T.home.pj)} punts per partit` : "encara no hi han jugat gaire"}.`
    : `Juguem a casa: fora fan ${T.away.pj ? n1(T.away.pts / T.away.pj) : "–"} punts per partit.`);

  return {
    team: T, us, league: L, next, matches, headToHead, common, players, keepers, xi, lastXi,
    periodsFor: T.forBy, periodsAgainst: T.againstBy, summary, strengths, weaknesses, keys, watch,
  };
}

// ---------- Procedència: comparació amb actes de temporades passades (enganxades pel staff) ----------

export type RefActa = { id: string; rival_key: string; acta_id: string; team: string; label: string | null; data: { players: { id: string; name: string; dorsal: string; titular: boolean; gk: boolean }[] } };
export type Origins = {
  refs: RefActa[];
  teams: { team: string; label: string; n: number }[]; // equips de l'any passat i quantes d'aquest any hi eren
  stayed: { p: RPlayer; where: string[] }[];
  fresh: RPlayer[];
  left: { name: string; where: string }[];
};

export function origins(r: RivalReport, all: RefActa[]): Origins | null {
  const key = rivalKey(r.team.full);
  const refs = all.filter((x) => x.rival_key === key);
  if (!refs.length) return null;
  const tag = (x: RefActa) => x.label || prettyTeamName(x.team);
  // Jugadores de l'any passat: per número de fitxa i, per si de cas, pel nom
  const past = new Map<string, { name: string; where: Set<string> }>();
  for (const x of refs) for (const p of x.data.players ?? []) {
    const e = past.get(p.id) ?? { name: p.name, where: new Set<string>() };
    e.where.add(tag(x));
    past.set(p.id, e);
  }
  const nameKey = (pretty: string) => normalize(pretty);
  const prettyKeys = new Map([...past.entries()].map(([id, e]) => [nameKey(prettyFromFull(e.name)), id]));
  const stayed: Origins["stayed"] = [], fresh: RPlayer[] = [];
  const used = new Set<string>();
  for (const p of r.players) {
    const id = past.has(p.id) ? p.id : prettyKeys.get(nameKey(p.name));
    if (id) { used.add(id); stayed.push({ p, where: [...past.get(id)!.where] }); } else fresh.push(p);
  }
  const left = [...past.entries()].filter(([id]) => !used.has(id)).map(([, e]) => ({ name: prettyFromFull(e.name), where: [...e.where].join(", ") }));
  const counts = new Map<string, number>();
  for (const s of stayed) for (const w of s.where) counts.set(w, (counts.get(w) ?? 0) + 1);
  const teams = [...new Set(refs.map(tag))].map((t) => ({ team: t, label: t, n: counts.get(t) ?? 0 }));
  return { refs, teams, stayed, fresh, left };
}

/** «PREMIA DALT, C.D. A» → «Premià Dalt A» (aprox.). */
function prettyTeamName(s: string) {
  const letter = s.trim().match(/\s([A-Z])$/)?.[1];
  const base = s.split(",")[0].toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
  return letter ? `${base} ${letter}` : base;
}
/** «COGNOM1 COGNOM2, NOM» → «Nom Cognom1» (com a les estadístiques). */
function prettyFromFull(full: string) {
  const [sur, given = ""] = full.split(",").map((x) => x.trim());
  const cap = (x: string) => x.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
  return [cap(given.split(/\s+/)[0] ?? ""), cap(sur.split(/\s+/)[0] ?? "")].filter(Boolean).join(" ") || cap(full);
}
