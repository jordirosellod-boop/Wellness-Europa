// «Enganxar de la FCF»: el text que es copia de la web de la FCF (com qualsevol espectador) convertit en dades.
// Ara: l'acta d'un partit (data, hora, camp, resultat, gols i alineacions). Funció pura: no guarda res.

export type PastedGoal = { minute: number; team: string; dorsal: string; name: string; side: "home" | "away"; own: boolean; penalty: boolean };
export type PastedPlayer = { team: string; dorsal: string; name: string; titular: boolean; cap: boolean };
export type PastedActa = {
  kind: "acta";
  date: string | null; // 2026-11-15
  time: string | null; // 19:30
  venue: string | null;
  home: string; away: string;
  home_goals: number | null; away_goals: number | null;
  finished: boolean;
  goals: PastedGoal[];
  players: PastedPlayer[];
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const isName = (s: string) => /\p{L}{2,}/u.test(s) && !/^\d/.test(s);
const SECTION = /^(TITULARS?|SUPLENTS?|RESERVES|BANQUETA|ENTRENADORS?|STAFF|TÈCNICS?|TECNICS?|COS TÈCNIC|DELEGATS?|ÀRBITRES?|ARBITRES?|TARGETES|CANVIS|GOLS|INCIDÈNCIES|OBSERVACIONS)$/i;

/** Llegeix el text d'una acta copiada de la FCF. Si no ho sembla, torna null. */
export function parseActaText(raw: string): PastedActa | null {
  const lines = raw.replace(/\r/g, "").split("\n").map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);
  if (!lines.length) return null;
  const val = (re: RegExp) => { for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); } return null; };
  const d = val(/^DATA\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
  const t = val(/^HORARI\s*:\s*(\d{1,2}[.:h]\d{2})/i);
  const venue = val(/^ESTADI\s*:\s*(.+)$/i);
  const date = d ? (() => { const [dd, mm, yy] = d.split(/[./-]/).map(Number); const y = yy < 100 ? 2000 + yy : yy; return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`; })() : null;
  const time = t ? t.replace(/[.h]/i, ":").replace(/^(\d):/, "0$1:") : null;

  // Equips i resultat: «LOCAL / VISITANT / LOCAL / 4 / - / 5 / VISITANT»
  let home = "", away = "", hg: number | null = null, ag: number | null = null, scoreAt = -1;
  for (let i = 0; i + 2 < lines.length; i++) {
    const a = lines[i], dash = lines[i + 1], b = lines[i + 2];
    const one = a.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (/^\d{1,2}$/.test(a) && dash === "-" && /^\d{1,2}$/.test(b)) { hg = Number(a); ag = Number(b); scoreAt = i; break; }
    if (one && i > 0 && isName(lines[i - 1]) && isName(lines[i + 1] ?? "") && !/^\(/.test(lines[i + 1])) { hg = Number(one[1]); ag = Number(one[2]); scoreAt = i; break; }
  }
  if (scoreAt > 0) {
    home = lines[scoreAt - 1];
    const after = lines.slice(scoreAt + 1).find((l) => l !== "-" && !/^\d{1,2}$/.test(l)) ?? "";
    away = after;
  }
  if (!home || !away) {
    // Sense resultat (encara no jugat): els dos primers noms després de l'estadi
    const names = lines.slice(lines.findIndex((l) => /^ESTADI/i.test(l)) + 1).filter((l) => isName(l) && !/^(FINALITZAT|PENDENT|AJORNAT|SUSPÈS)$/i.test(l) && !SECTION.test(l));
    home ||= names[0] ?? ""; away ||= names[1] ?? "";
  }
  if (!home || !away || (!date && hg == null)) return null;
  const hk = norm(home), ak = norm(away);
  const sideOf = (team: string): "home" | "away" | null => {
    const k = norm(team);
    if (k === hk || hk.startsWith(k) || k.startsWith(hk)) return "home";
    if (k === ak || ak.startsWith(k) || k.startsWith(ak)) return "away";
    return null;
  };
  const finished = lines.some((l) => /^(FINALITZAT|ACTA TANCADA|TANCADA)$/i.test(l)) || (hg != null && ag != null);

  // Gols: «1 - 0 / EQUIP / (3') / 17 / NOM»
  const goals: PastedGoal[] = [];
  let ph = 0, pa = 0;
  for (let i = 0; i < lines.length; i++) {
    const sc = lines[i].match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (!sc || i === scoreAt) continue;
    const team = lines[i + 1] ?? "", min = (lines[i + 2] ?? "").match(/^\((\d{1,3})(?:\+\d+)?['’]?\)/);
    if (!min || !sideOf(team)) continue;
    let j = i + 3, dorsal = "";
    if (/^\d{1,2}$/.test(lines[j] ?? "")) dorsal = lines[j++];
    const name = isName(lines[j] ?? "") ? lines[j] : "";
    const h = Number(sc[1]), a = Number(sc[2]);
    const side: "home" | "away" = h > ph ? "home" : a > pa ? "away" : (sideOf(team) as "home" | "away");
    ph = h; pa = a;
    const extra = lines.slice(i + 2, j + 2).join(" ");
    goals.push({ minute: Number(min[1]), team, dorsal, name, side, own: sideOf(team) !== side || /PR[OÒ]PIA|\bPP\b/i.test(extra), penalty: /PENAL|\(P\)/i.test(extra) });
  }

  // Alineacions: després de «TITULARS» (i «SUPLENTS»), el nom de l'equip i «dorsal / nom / [minut] / [C]»
  const players: PastedPlayer[] = [];
  let section: "tit" | "sup" | null = null, team: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^TITULARS?$/i.test(l)) { section = "tit"; continue; }
    if (/^(SUPLENTS?|RESERVES|BANQUETA)$/i.test(l)) { section = "sup"; continue; }
    if (SECTION.test(l)) { section = null; continue; }
    if (!section) continue;
    if (isName(l) && sideOf(l) && !/^\d/.test(l) && !(i > 0 && /^\d{1,2}$/.test(lines[i - 1]))) { team = l; continue; }
    if (/^\d{1,2}$/.test(l) && team && isName(lines[i + 1] ?? "") && !sideOf(lines[i + 1])) {
      const name = lines[i + 1];
      let cap = false, k = i + 2;
      while (k < lines.length && (/^\d{1,3}\s*['’]$/.test(lines[k]) || /^C$/i.test(lines[k]))) { if (/^C$/i.test(lines[k])) cap = true; k++; }
      if (!players.some((p) => p.team === team && p.name === name)) players.push({ team, dorsal: l, name, titular: section === "tit", cap });
      i = k - 1;
    }
  }
  return { kind: "acta", date, time, venue, home, away, home_goals: hg, away_goals: ag, finished, goals, players };
}

export type PastedResult = { home: string; away: string; date: string | null; time: string | null; home_goals: number | null; away_goals: number | null; closed: boolean; status: string | null; venue: string | null };

/**
 * Llegeix la pestanya «Resultats» d'una jornada copiada de la FCF. Cada partit surt com:
 * LOCAL / LOCAL / [ESTAT / dd/mm/aaaa / hh:mm / 4 / - / 2] / VISITANT / VISITANT / INFORMACIÓ DEL CAMP / camp
 */
export function parseResultsText(raw: string): PastedResult[] {
  const L = raw.replace(/\r/g, "").split("\n").map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);
  const team = (i: number) => (i + 1 < L.length && L[i] === L[i + 1] && isName(L[i]) && !/^INFORMACI/i.test(L[i]) ? L[i] : null);
  const out: PastedResult[] = [];
  let i = 0;
  while (i < L.length) {
    const home = team(i);
    if (!home) { i++; continue; }
    let j = i + 2, status: string | null = null, date: string | null = null, time: string | null = null, hg: number | null = null, ag: number | null = null;
    if (j < L.length && !team(j) && /^[A-ZÀ-Ú .]{4,}$/.test(L[j]) && !/^INFORMACI/i.test(L[j])) status = L[j++];
    const dm = (L[j] ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dm) { date = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`; j++; }
    const tm = (L[j] ?? "").match(/^(\d{1,2})[:.](\d{2})$/);
    if (tm) { time = `${tm[1].padStart(2, "0")}:${tm[2]}`; j++; }
    if (/^\d{1,2}$/.test(L[j] ?? "") && L[j + 1] === "-" && /^\d{1,2}$/.test(L[j + 2] ?? "")) { hg = Number(L[j]); ag = Number(L[j + 2]); j += 3; }
    const away = team(j);
    if (!away) { i++; continue; }
    j += 2;
    let venue: string | null = null;
    if (/^INFORMACI/i.test(L[j] ?? "")) { venue = L[j + 1] && !team(j + 1) ? L[j + 1] : null; j += venue ? 2 : 1; }
    const closed = !!status && /TANCADA|FINALITZAT/i.test(status) && hg != null && ag != null;
    out.push({ home, away, date, time, home_goals: hg, away_goals: ag, closed, status, venue });
    i = j;
  }
  return out;
}

/** Què s'ha enganxat: una acta o la pestanya de resultats d'una jornada. */
export function parseFcfText(raw: string): { kind: "acta"; acta: PastedActa } | { kind: "results"; results: PastedResult[] } | null {
  const isResults = /INFORMACI[ÓO] DEL CAMP/i.test(raw) && !/^\s*DATA\s*:/im.test(raw);
  if (isResults) { const r = parseResultsText(raw); return r.length ? { kind: "results", results: r } : null; }
  const a = parseActaText(raw);
  return a ? { kind: "acta", acta: a } : null;
}
