"use client";

import { useEffect, useState } from "react";
import { FINE_COLS, fmtEuros, type Fine, type FineRule, type FinesSummary } from "@/lib/fines";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, friendlyError } from "@/lib/wellness";

type Data = { mine: Fine[]; pot: FinesSummary | null; rules: FineRule[] };

async function fetchMine(playerId: string): Promise<Data> {
  const sb = supabase();
  const [mine, pot, rules] = await Promise.all([
    // La base de dades només retorna les seves; el filtre és només per claredat.
    fetchAll<Fine>((f, t) => sb.from("fines").select(FINE_COLS).eq("person_id", playerId).order("fine_date", { ascending: false }).order("id").range(f, t)),
    sb.rpc("fines_summary"),
    fetchAll<FineRule>((f, t) => sb.from("fine_rules").select("id, name, amount_cents, active").eq("active", true).order("name").order("id").range(f, t)),
  ]);
  if (pot.error) throw new Error(pot.error.message);
  const row = (Array.isArray(pot.data) ? pot.data[0] : pot.data) as FinesSummary | null;
  return { mine, pot: row, rules };
}

/** Multes de la jugadora: les seves, el pot de l'equip (només totals) i les normes. */
export function PlayerFines({ playerId }: { playerId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMine(playerId).then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [playerId]);

  if (error) return <p className="msg error">{friendlyError(error)}</p>;
  if (!data) return null;

  const pending = data.mine.filter((f) => !f.paid).reduce((a, f) => a + f.amount_cents, 0);
  const paid = data.mine.filter((f) => f.paid).reduce((a, f) => a + f.amount_cents, 0);

  return (
    <>
      <h2 style={{ marginTop: 20 }}>Multes</h2>
      <section className="card">
        <div className="stats">
          <div className="stat">
            Deus
            <b style={{ color: pending ? "var(--taronja)" : "var(--verd)" }}>{fmtEuros(pending)}</b>
          </div>
          <div className="stat">
            Has pagat
            <b>{fmtEuros(paid)}</b>
          </div>
        </div>
        {data.mine.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>No tens cap multa. 👏</p>
        ) : (
          <ul className="list" style={{ marginTop: 12 }}>
            {data.mine.map((f) => (
              <li key={f.id}>
                <div className="row between">
                  <span>
                    <b>{f.reason}</b> · {fmtEuros(f.amount_cents)}
                  </span>
                  {f.paid ? <span className="chip fet">Pagada</span> : <span className="chip pendent">Pendent</span>}
                </div>
                <div className="muted small">
                  {fmtDate(f.fine_date)}
                  {f.notes ? ` · ${f.notes}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.pot && (
        <section className="card">
          <h3>Pot de l&apos;equip</h3>
          <p style={{ margin: 0 }}>
            Total <b>{fmtEuros(Number(data.pot.total_cents))}</b> · al pot <b>{fmtEuros(Number(data.pot.paid_cents))}</b> · pendent{" "}
            <b>{fmtEuros(Number(data.pot.pending_cents))}</b>
          </p>
        </section>
      )}
      {data.rules.length > 0 && (
        <details className="card">
          <summary><b>Normes de l&apos;equip</b> ({data.rules.length})</summary>
          <ul className="list" style={{ marginTop: 10 }}>
            {data.rules.map((r) => (
              <li key={r.id} className="row between">
                <span>{r.name}</span>
                <b>{fmtEuros(r.amount_cents)}</b>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
