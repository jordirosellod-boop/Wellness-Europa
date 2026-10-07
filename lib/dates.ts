// Dates com a text "AAAA-MM-DD" (dies de calendari, sense hora ni zona horària).
// Es calculen en UTC perquè sumar dies no es desquadri amb els canvis d'hora.

function toUtc(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = toUtc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUtc(x);
}

/** 1 = dilluns ... 7 = diumenge (igual que a la base de dades). */
export function isoDow(d: string): number {
  return ((toUtc(d).getUTCDay() + 6) % 7) + 1;
}

export function startOfWeek(d: string): string {
  return addDays(d, 1 - isoDow(d));
}

export function startOfMonth(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function addMonths(d: string, n: number): string {
  const x = toUtc(startOfMonth(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return fromUtc(x);
}

/** Totes les setmanes (de dilluns a diumenge) que toquen el mes de la data. */
export function monthWeeks(d: string): string[][] {
  const first = startOfMonth(d);
  const last = addDays(addMonths(first, 1), -1);
  const weeks: string[][] = [];
  for (let day = startOfWeek(first); day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  }
  return weeks;
}

export type CalView = "mes" | "setmana" | "dia";

/** Primer i últim dia que es veuen a cada vista. */
export function viewRange(view: CalView, anchor: string): { from: string; to: string } {
  if (view === "dia") return { from: anchor, to: anchor };
  if (view === "setmana") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  const weeks = monthWeeks(anchor);
  return { from: weeks[0][0], to: weeks[weeks.length - 1][6] };
}

export function moveAnchor(view: CalView, anchor: string, dir: -1 | 1): string {
  if (view === "dia") return addDays(anchor, dir);
  if (view === "setmana") return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir);
}

export const WEEKDAYS_SHORT = ["Dl", "Dt", "Dc", "Dj", "Dv", "Ds", "Dg"];

export function fmtMonth(d: string): string {
  const s = new Intl.DateTimeFormat("ca-ES", { timeZone: "UTC", month: "long", year: "numeric" }).format(toUtc(d));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtShort(d: string): string {
  return new Intl.DateTimeFormat("ca-ES", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(toUtc(d));
}
