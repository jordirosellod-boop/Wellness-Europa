// Les jornades copiades de la web de la FCF que porta l'app, per fer-les servir també des del navegador
// (calendari, estadístiques, resultat del partit) sense esperar l'actualització automàtica.
import seedData from "@/lib/fcf-manual-seed.json";

type Seed = { kickoff?: string | null; home_goals?: number | null; away_goals?: number | null; closed?: boolean };
const SEED = (seedData as { manual: Record<string, Seed> }).manual;

/** Aplica les dades copiades a una fila de partit (si la FCF no l'ha tancat ja amb el resultat). */
export function withSeed<T extends { acta_id: string; closed?: boolean; home_goals?: number | null }>(m: T): T {
  const s = SEED[m.acta_id];
  if (!s || (m.closed && m.home_goals != null)) return m;
  return { ...m, ...s };
}
