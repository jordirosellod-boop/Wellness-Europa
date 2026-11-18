// Semàfor de disponibilitat i alerta de tendència (només staff). Funcions pures: les fan servir la pantalla i els avisos.

export type Level = "red" | "yellow" | "green" | "none" | "away";
export type WellRow = { player_id: string; date: string; score: number; sleep: number; fatigue: number; mood: number; has_pain: boolean };
export type Readiness = { level: Level; reasons: string[]; trend: number[] | null };

const n1 = (x: number) => x.toFixed(1).replace(".", ",").replace(",0", "");

/**
 * Tendència a la baixa: els 3 últims wellness (de dies diferents, dels últims 10 dies) baixen cada vegada
 * i en total més d'1,5 punts. Torna les tres puntuacions (de la més antiga a la d'avui) o null.
 */
export function downTrend(rows: WellRow[], today: string): number[] | null {
  const byDay = new Map<string, number>();
  for (const r of rows) if (r.date <= today) byDay.set(r.date, Math.min(byDay.get(r.date) ?? 99, Number(r.score)));
  const days = [...byDay.keys()].sort().slice(-3);
  if (days.length < 3) return null;
  const tenAgo = new Date(`${today}T12:00:00Z`); tenAgo.setUTCDate(tenAgo.getUTCDate() - 10);
  if (days[0] < tenAgo.toISOString().slice(0, 10)) return null;
  const s = days.map((d) => byDay.get(d)!);
  return s[0] > s[1] && s[1] > s[2] && s[0] - s[2] >= 1.5 ? s : null;
}
export const fmtTrend = (t: number[]) => t.map(n1).join(" → ");

/**
 * El color de cada jugadora avui:
 *  · vermell: lesionada, ha marcat dolor, wellness ≤ 4 o càrrega en risc (ACWR > 1,5)
 *  · groc: wellness < 6, algun valor ≤ 3 (son, energia o ànim), càrrega alta (> 1,3) o baixa (< 0,8), o tendència a la baixa
 *  · verd: ha fet el wellness i tot bé · gris: encara no l'ha fet · «no ve»: ha avisat que no vindrà
 */
export function readinessOf(o: {
  injured: boolean; away: boolean; today: WellRow | null; history: WellRow[]; acwr: number | null; acwrReliable: boolean; date: string;
}): Readiness {
  const red: string[] = [], yellow: string[] = [];
  if (o.injured) red.push("Lesionada");
  const w = o.today;
  if (w) {
    if (w.has_pain) red.push("Ha marcat dolor");
    if (w.score <= 4) red.push(`Wellness ${n1(w.score)}`);
    else if (w.score < 6) yellow.push(`Wellness ${n1(w.score)}`);
    const low = ([["son", w.sleep], ["energia", w.fatigue], ["ànim", w.mood]] as const).filter(([, v]) => v <= 3).map(([k, v]) => `${k} ${v}`);
    if (low.length && w.score > 4) yellow.push(`Baix: ${low.join(", ")}`);
  }
  if (o.acwr != null && o.acwrReliable) {
    if (o.acwr > 1.5) red.push(`Càrrega en risc (${n1(o.acwr)})`);
    else if (o.acwr > 1.3) yellow.push(`Càrrega alta (${n1(o.acwr)})`);
    else if (o.acwr < 0.8) yellow.push(`Càrrega baixa (${n1(o.acwr)})`);
  }
  const trend = downTrend(o.history, o.date);
  if (trend) yellow.push(`Baixant: ${fmtTrend(trend)}`);
  if (red.length) return { level: "red", reasons: [...red, ...yellow], trend };
  if (o.away && !w) return { level: "away", reasons: ["Ha avisat que no vindrà"], trend };
  if (yellow.length) return { level: "yellow", reasons: yellow, trend };
  if (!w) return { level: "none", reasons: ["Encara no ha fet el wellness"], trend };
  return { level: "green", reasons: [], trend };
}

export const LEVEL_ORDER: Record<Level, number> = { red: 0, yellow: 1, none: 2, away: 3, green: 4 };
