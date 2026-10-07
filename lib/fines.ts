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
};

export type FinesSummary = { total_cents: number; paid_cents: number; pending_cents: number; fines_count: number };

export const FINE_COLS = "id, person_id, rule_id, reason, amount_cents, fine_date, notes, paid, paid_at";

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
