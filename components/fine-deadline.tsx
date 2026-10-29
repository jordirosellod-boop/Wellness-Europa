import { daysToPay, fmtEuros, type Fine } from "@/lib/fines";
import { fmtShort } from "@/lib/dates";

/** Sota cada multa pendent: quant falta per pagar-la abans que es dupliqui (o que ja s'ha duplicat). */
export function FineDeadline({ f, today, who = "tu" }: { f: Fine; today: string; who?: "tu" | "staff" }) {
  if (f.paid) return null;
  if (f.doubled_at) {
    return (
      <div className="fine-due doubled">
        <span><b>×2 Duplicada</b> · no es va pagar a temps{f.base_cents ? ` (era ${fmtEuros(f.base_cents)})` : ""}</span>
      </div>
    );
  }
  const d = daysToPay(f, today);
  if (d == null || !f.due_date) return null;
  // Barra: 14 dies en total
  const pct = Math.max(4, Math.min(100, Math.round((d / 14) * 100)));
  const tone = d <= 2 ? "hot" : d <= 6 ? "warm" : "ok";
  const text = d === 0
    ? `Avui és l'últim dia per pagar-la`
    : `${who === "tu" ? "Et queden" : "Queden"} ${d} ${d === 1 ? "dia" : "dies"} per pagar-la (fins al ${fmtShort(f.due_date)})`;
  return (
    <div className={`fine-due ${tone}`}>
      <span>⏳ {text}. Després passa a <b>{fmtEuros(Math.min(f.amount_cents * 2, 100000))}</b>.</span>
      <i className="fine-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></i>
    </div>
  );
}
