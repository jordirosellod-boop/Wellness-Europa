// ACWR (ràtio de càrrega aguda:crònica) amb mitjanes mòbils exponencials (EWMA),
// segons Williams et al. (2017): λ = 2 / (N + 1), amb N = 7 dies (aguda) i 28 dies (crònica).
// La càrrega diària és la suma de les càrregues (RPE × minuts) d'aquell dia; un dia sense
// sessió compta com a 0.

import { addDays } from "./dates";

export const LAMBDA_ACUTE = 2 / (7 + 1);
export const LAMBDA_CHRONIC = 2 / (28 + 1);
/** Dies d'historial que es fan servir per calcular (el pes del que queda fora és < 0,3 %). */
export const HISTORY_DAYS = 84;
/** Mínim de dies des de la primera dada perquè el valor sigui fiable. */
export const MIN_DAYS = 21;

export type AcwrResult = {
  acute: number; // EWMA aguda (UA/dia)
  chronic: number; // EWMA crònica (UA/dia)
  acwr: number | null; // null si la crònica és 0
  days: number; // dies des de la primera dada fins a la data de càlcul
  week: number; // suma de càrrega dels últims 7 dies (per entendre-ho millor)
};

/**
 * @param daily  càrrega per dia ("AAAA-MM-DD" → UA). Només calen els dies amb càrrega.
 * @param asOf   dia de càlcul (inclòs).
 */
export function ewmaAcwr(daily: Map<string, number>, asOf: string): AcwrResult | null {
  const dates = [...daily.keys()].filter((d) => d <= asOf).sort();
  if (dates.length === 0) return null;
  const start = dates[0];
  let acute = 0;
  let chronic = 0;
  let days = 0;
  for (let d = start; d <= asOf; d = addDays(d, 1)) {
    const load = daily.get(d) ?? 0;
    acute = load * LAMBDA_ACUTE + (1 - LAMBDA_ACUTE) * acute;
    chronic = load * LAMBDA_CHRONIC + (1 - LAMBDA_CHRONIC) * chronic;
    days++;
  }
  let week = 0;
  for (let i = 0; i < 7; i++) week += daily.get(addDays(asOf, -i)) ?? 0;
  return { acute, chronic, acwr: chronic > 0 ? acute / chronic : null, days, week };
}

export function acwrBand(acwr: number): { label: string; cls: string } {
  if (acwr > 1.5) return { label: "Risc", cls: "band-baix" };
  if (acwr > 1.3) return { label: "Alerta", cls: "band-alerta" };
  if (acwr >= 0.8) return { label: "Òptima", cls: "band-bo" };
  return { label: "Baixa", cls: "band-moderat" };
}

export function fmtRatio(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
