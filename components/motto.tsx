"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** La frase del míster (la veu tot l'equip a la salutació). */
export function useMotto(): [string | null, (m: string | null) => void] {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase().from("team_settings").select("motto").eq("id", true).maybeSingle()
      .then(({ data }) => alive && setM((data?.motto as string | null) ?? null), () => {});
    return () => { alive = false; };
  }, []);
  return [m, setM];
}

/** A la salutació: la frase en daurat. */
export function MottoLine({ motto }: { motto: string | null }) {
  if (!motto) return null;
  return <p className="greet-motto"><span aria-hidden="true">“</span>{motto}<span aria-hidden="true">”</span><small> · Míster</small></p>;
}

/** Staff: escriure, canviar o treure la frase del míster. */
export function MottoEditor() {
  const [motto, setMotto] = useMotto();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(v: string | null) {
    const val = v?.trim() ? v.trim().replace(/[<>]/g, "").slice(0, 120) : null;
    setBusy(true); setMsg(null);
    const { error } = await supabase().from("team_settings").update({ motto: val, updated_at: new Date().toISOString() }).eq("id", true).select("id").single();
    setBusy(false);
    if (error) return setMsg({ ok: false, text: `No s'ha pogut desar: ${error.message}` });
    setMotto(val); setDraft(null);
    setMsg({ ok: true, text: val ? "Desat ✓ Ja la veuen totes les jugadores." : "Frase treta." });
  }
  return (
    <section className="card motto-card">
      <div className="row between" style={{ alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>✍️ Frase del míster</h2>
        {draft == null && <button type="button" className="btn small secondary" onClick={() => setDraft(motto ?? "")}>{motto ? "Canviar" : "Escriure"}</button>}
      </div>
      {draft == null ? (
        motto ? <p className="motto-now">“{motto}”</p> : <p className="muted small" style={{ margin: "6px 0 0" }}>Una frase per a l&apos;equip que surt a dalt de l&apos;app de totes les jugadores.</p>
      ) : (
        <div className="stack" style={{ marginTop: 8 }}>
          <input type="text" maxLength={120} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Avui, intensitat i cap" autoFocus />
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn small" disabled={busy || !draft.trim()} onClick={() => void save(draft)}>Desar</button>
            {motto && <button type="button" className="btn small secondary" disabled={busy} onClick={() => void save(null)}>Treure-la</button>}
            <button type="button" className="btn small secondary" disabled={busy} onClick={() => setDraft(null)}>Cancel·lar</button>
          </div>
        </div>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}
    </section>
  );
}
