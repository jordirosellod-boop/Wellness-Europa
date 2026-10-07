// Lectura de dades públiques de la Federació Catalana de Futbol (fcf.cat).
// Només funcions pures i de lectura; la sincronització amb la base de dades és a lib/fcf-sync.ts.

export const FCF_BASE = "https://www.fcf.cat";
const UA = "Mozilla/5.0 (compatible; WellnessCEEuropa/1.0)";

export type FcfMatch = {
  acta_id: string;
  jornada: number;
  kickoff: string | null; // "AAAA-MM-DDTHH:MM:SS" (hora local)
  home: string;
  away: string;
  home_goals: number | null;
  away_goals: number | null;
  is_home: boolean;
  closed: boolean;
};

export type ActaPlayer = { fcf_id: string; full_name: string; dorsal: string; titular: boolean; goalkeeper: boolean };
export type ActaGoal = { fcf_id: string; full_name: string; kind: "GOL" | "GOL PENAL" | "GOL EN PRÒPIA"; minute: number; team: string };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${FCF_BASE}${path}`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`FCF ${path}: ${res.status}`);
  return (await res.json()) as T;
}

type RawMatch = {
  JORNADA: string; CODACTA: string; CODEQUIPO_CASA: string; NOMBRE_CASA: string; CODEQUIPO_FUERA: string; NOMBRE_FUERA: string;
  GOLES_CASA: string | null; GOLES_FUERA: string | null; COMIENZO1: string | null; CERRADA: string;
};

/** Partits del nostre equip al grup (de la jornada 1 a l'última). */
export async function fetchTeamMatches(grupId: string, teamId: string): Promise<FcfMatch[]> {
  const byRound = await getJson<Record<string, RawMatch[]>>(`/api/competition/partidos?grupId=${encodeURIComponent(grupId)}`);
  const out: FcfMatch[] = [];
  for (const list of Object.values(byRound)) {
    for (const m of list) {
      const isHome = m.CODEQUIPO_CASA === teamId;
      if (!isHome && m.CODEQUIPO_FUERA !== teamId) continue;
      const num = (v: string | null) => (v == null || v === "" ? null : Number(v));
      out.push({
        acta_id: m.CODACTA,
        jornada: Number(m.JORNADA),
        kickoff: m.COMIENZO1,
        home: m.NOMBRE_CASA.trim(),
        away: m.NOMBRE_FUERA.trim(),
        home_goals: num(m.GOLES_CASA),
        away_goals: num(m.GOLES_FUERA),
        is_home: isHome,
        closed: m.CERRADA === "1",
      });
    }
  }
  return out.sort((a, b) => a.jornada - b.jornada);
}

/** Totals de temporada d'una jugadora al grup (els mateixos que mostra la web de la FCF). */
export async function fetchPlayerTotals(fcfId: string, grupId: string, temporada: string) {
  const q = new URLSearchParams({ jugadorId: fcfId, codgrupo: grupId, temporada });
  const r = await getJson<{ partidos?: number | string; goles?: number | string; sanciones?: number | string }>(`/api/competition/jugador-stats?${q}`);
  return { matches: Number(r.partidos ?? 0), goals: Number(r.goles ?? 0), sanctions: Number(r.sanciones ?? 0) };
}

/** Descarrega l'acta (pàgina web) i en retorna el contingut de dades intern (format RSC de Next.js). */
export async function fetchActaPayload(actaId: string): Promise<string> {
  const res = await fetch(`${FCF_BASE}/ca/competicio/acta/${encodeURIComponent(actaId)}`, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`FCF acta ${actaId}: ${res.status}`);
  return extractPayload(await res.text());
}

export function extractPayload(html: string): string {
  const parts: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) parts.push(JSON.parse(`"${m[1]}"`) as string);
  return parts.join("");
}

/**
 * Llegeix alineacions i gols de l'acta, només del nostre equip.
 * @param teamMatch text que identifica el nostre equip a l'acta (p. ex. "EUROPA").
 */
export function parseActa(payload: string, teamMatch: string): { players: ActaPlayer[]; goals: ActaGoal[] } {
  const ours = (team: string) => team.toUpperCase().includes(teamMatch.toUpperCase());

  // Alineació: objectes "player" amb el camp "titular".
  const players = new Map<string, ActaPlayer>();
  const lineupRe =
    /"player":\{"id":"(\d+)","nombre":"((?:[^"\\]|\\.)*)","dorsal":"([^"]*)","titular":"(\d)","capitan":"\d","portero":(\d)\},"teamName":"((?:[^"\\]|\\.)*)"/g;
  for (let m = lineupRe.exec(payload); m; m = lineupRe.exec(payload)) {
    if (!ours(m[6])) continue;
    const prev = players.get(m[1]);
    const p: ActaPlayer = { fcf_id: m[1], full_name: m[2], dorsal: m[3], titular: m[4] === "1", goalkeeper: m[5] === "1" };
    players.set(m[1], prev ? { ...p, titular: prev.titular || p.titular } : p);
  }

  // Gols: objectes "player" sense "titular", seguits del text "(GOL (19'))".
  const goals: ActaGoal[] = [];
  const goalRe =
    /"player":\{"id":"(\d+)","nombre":"((?:[^"\\]|\\.)*)","dorsal":"[^"]*"\},"teamName":"((?:[^"\\]|\\.)*)"[\s\S]{0,600}?\["\(","(GOL EN PRÒPIA|GOL PENAL|GOL)"," ","\((\d+)'\)"/g;
  for (let m = goalRe.exec(payload); m; m = goalRe.exec(payload)) {
    goals.push({ fcf_id: m[1], full_name: m[2], team: m[3], kind: m[4] as ActaGoal["kind"], minute: Number(m[5]) });
  }
  return { players: [...players.values()], goals: goals.filter((g) => ours(g.team)) };
}

// ---------- Relació de noms FCF ↔ app ----------

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-zñç' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Possibles maneres d'escriure a l'app una jugadora de la FCF ("COGNOM1 COGNOM2, NOM"):
 * "nom cognom1", "nom cognom1 cognom2", "nom c" (inicial)... Els cognoms compostos ("DEL MORAL")
 * es cobreixen provant tots els prefixos.
 */
export function nameVariants(fcfFullName: string): string[] {
  const [surnames, given = ""] = fcfFullName.split(",").map((x) => normalize(x));
  if (!given || !surnames) return [];
  const st = surnames.split(" ");
  const out = new Set<string>();
  for (let i = 1; i <= st.length; i++) out.add(`${given} ${st.slice(0, i).join(" ")}`);
  out.add(`${given} ${st[0][0]}`); // "laia m."
  const firstGiven = given.split(" ")[0];
  if (firstGiven !== given) for (let i = 1; i <= st.length; i++) out.add(`${firstGiven} ${st.slice(0, i).join(" ")}`);
  return [...out];
}

/** Relaciona cada jugadora FCF amb una de l'app només si la coincidència és única en tots dos sentits. */
export function matchNames(fcf: { fcf_id: string; full_name: string }[], app: { id: string; display_name: string }[]): Map<string, string> {
  const appNorm = app.map((a) => ({ id: a.id, n: normalize(a.display_name.replace(/\./g, " ")) }));
  const cand = new Map<string, string[]>();
  for (const f of fcf) {
    const v = new Set(nameVariants(f.full_name));
    cand.set(f.fcf_id, appNorm.filter((a) => v.has(a.n)).map((a) => a.id));
  }
  const usage = new Map<string, number>();
  for (const ids of cand.values()) for (const id of ids) usage.set(id, (usage.get(id) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const [fid, ids] of cand) if (ids.length === 1 && usage.get(ids[0]) === 1) out.set(fid, ids[0]);
  return out;
}
