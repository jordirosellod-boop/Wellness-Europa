export const TZ = "Europe/Madrid";

export type Kind = "Entrenament" | "Partit";

export type Session = {
  id: string;
  session_date: string; // AAAA-MM-DD
  start_time: string | null; // HH:MM:SS
  kind: Kind;
  name: string;
  duration_min: number | null; // durada prevista
  rule_id: string | null; // programació que l'ha generat
  cancelled: boolean;
};

export const SESSION_COLS = "id, session_date, start_time, kind, name, duration_min, rule_id, cancelled";

export type SessionRule = {
  id: string;
  name: string;
  kind: Kind;
  weekdays: number[];
  start_time: string | null;
  duration_min: number | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
};

export type Profile = { id: string; role: "coach" | "player"; display_name: string; created_at?: string };

export type Wellness = {
  id: string;
  session_id: string;
  player_id: string;
  sleep: number;
  fatigue: number;
  mood: number;
  score: number;
  has_pain: boolean;
  pain_description: string | null;
  notes: string | null;
  submitted_at: string;
  updated_at: string;
};

export type Rpe = {
  id: string;
  session_id: string;
  player_id: string;
  rpe: number;
  duration_min: number | null; // durada real
  load: number | null; // RPE x minuts (la calcula la base de dades)
  notes: string | null;
  submitted_at: string;
  updated_at: string;
};

export const WELLNESS_VARS = [
  { key: "sleep", label: "Son", low: "He dormit molt malament", high: "He dormit molt bé" },
  { key: "fatigue", label: "Fatiga / molèsties musculars", short: "Fatiga", low: "Molt cansada", high: "Fresca" },
  { key: "mood", label: "Estat d'ànim / estrès", short: "Ànim", low: "Molt estressada o de mal humor", high: "Molt bé" },
] as const;

export type WellnessKey = (typeof WELLNESS_VARS)[number]["key"];

export function shortLabel(v: (typeof WELLNESS_VARS)[number]): string {
  return "short" in v ? v.short : v.label;
}

// Escala de Borg CR-10 (percepció de l'esforç).
export const RPE_LABELS: Record<number, string> = {
  0: "Repòs",
  1: "Molt, molt suau",
  2: "Suau",
  3: "Moderat",
  4: "Una mica dur",
  5: "Dur",
  6: "Dur",
  7: "Molt dur",
  8: "Molt dur",
  9: "Molt, molt dur",
  10: "Màxim",
};

/** Alerta per cada variable amb valor menor de 5 (el 5 no és alerta). */
export function alertsOf(w: Pick<Wellness, WellnessKey>): { label: string; value: number }[] {
  return WELLNESS_VARS.filter((v) => w[v.key] < 5).map((v) => ({ label: shortLabel(v), value: w[v.key] }));
}

export function bandOf(score: number): { label: string; cls: string } {
  if (score >= 8) return { label: "Bo", cls: "band-bo" };
  if (score >= 6) return { label: "Moderat", cls: "band-moderat" };
  if (score >= 4) return { label: "Alerta", cls: "band-alerta" };
  return { label: "Baix", cls: "band-baix" };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return round1(nums.reduce((a, b) => a + Number(b), 0) / nums.length);
}

/** Data d'avui a Barcelona, en format AAAA-MM-DD. */
export function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Hora (24h) d'un timestamp, en hora de Barcelona. */
export function fmtTime(ts: string): string {
  return new Intl.DateTimeFormat("ca-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts));
}

/** Data i hora (24h) d'un timestamp, en hora de Barcelona. */
export function fmtDateTime(ts: string): string {
  return new Intl.DateTimeFormat("ca-ES", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ts));
}

/** "dimarts, 7 d’octubre de 2026" a partir de AAAA-MM-DD (sense desplaçaments d'hora). */
export function fmtDate(d: string, opts: { year?: boolean } = {}): string {
  const s = new Intl.DateTimeFormat("ca-ES", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(opts.year ? { year: "numeric" } : {}),
  }).format(new Date(`${d}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtSessionTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

/** Converteix un error de Supabase en un missatge entenedor. */
export function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security") || m.includes("permission denied"))
    return "No s'ha pogut desar: aquesta sessió només es pot omplir o modificar el mateix dia.";
  if (m.includes("duplicate key")) return "Ja hi havia un registre per a aquesta sessió. Torna a carregar la pàgina.";
  if (m.includes("check constraint")) return "Algun valor no és vàlid. Revisa el formulari.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed"))
    return "Sense connexió. Comprova internet i torna-ho a provar.";
  if (m.includes("jwt")) return "La sessió ha caducat. Torna a obrir el teu enllaç.";
  return `Error: ${message}`;
}
