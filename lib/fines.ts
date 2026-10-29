export type FineRule = { id: string; name: string; amount_cents: number; active: boolean };

export type Fine = {
  id: string;
  person_id: string;
  rule_id: string | null;
  reason: string;
  amount_cents: number;
  fine_date: string;
  notes: string | null;
  paid: boolean;
  paid_at: string | null;
  due_date: string | null;     // fins quan es pot pagar sense que es dupliqui
  doubled_at: string | null;   // quan s'ha duplicat (si s'ha duplicat)
  base_cents: number | null;   // l'import d'abans de duplicar
};

export type FinesSummary = { total_cents: number; paid_cents: number; pending_cents: number; fines_count: number };

export const FINE_COLS = "id, person_id, rule_id, reason, amount_cents, fine_date, notes, paid, paid_at, due_date, doubled_at, base_cents";

/** Dies que queden per pagar-la abans que es dupliqui (0 = avui és l'últim dia). null si ja està pagada o duplicada. */
export function daysToPay(f: Pick<Fine, "paid" | "doubled_at" | "due_date">, today: string): number | null {
  if (f.paid || f.doubled_at || !f.due_date) return null;
  const ms = Date.parse(`${f.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

const EUR = new Intl.NumberFormat("ca-ES", { style: "currency", currency: "EUR" });

export function fmtEuros(cents: number): string {
  return EUR.format(cents / 100);
}

/** "2", "2,5", "2.50" → 250 cèntims. Retorna null si no és un import vàlid (0,01 – 1.000 €). */
export function parseEuros(text: string): number | null {
  const t = text.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents >= 1 && cents <= 100000 ? cents : null;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
}
