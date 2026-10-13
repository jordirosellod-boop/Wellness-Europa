"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { activeOn, fetchInjuries, fetchRehab, type Injury, type RehabEntry } from "@/lib/rehab";
import { addDays } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { fmtDate, todayMadrid, type Profile } from "@/lib/wellness";

/** Staff: qui està lesionada, donar d'alta, i els entrenaments a part que han omplert. */
export function InjuriesAdmin({ players }: { players: Profile[] }) {
  const today = todayMadrid();
  const [injuries, setInjuries] = useState<Injury[] | null>(null);
  const [rehab, setRehab] = useState<RehabEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pid, setPid] = useState("");
  const [start, setStart] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(
    () =>
      Promise.all([fetchInjuries(), fetchRehab(addDays(today, -14), today)]).then(
        ([i, r]) => {
          setInjuries(i);
          setRehab(r);
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      ),
    [today],
  );
  useEffect(() => {
    load();
  }, [load]);

  const name = (id: string) => players.find((p) => p.id === id)?.display_name ?? "—";
  const active = (injuries ?? []).filter((i) => activeOn(i, today) || i.start_date > today);
  const recent = (injuries ?? []).filter((i) => i.end_date && i.end_date < today && i.end_date >= addDays(today, -30));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!pid) return setMsg({ ok: false, text: "Tria la jugadora." });
    setBusy(true);
    setMsg(null);
    const { data, error: er } = await supabase().from("injuries").insert({ player_id: pid, start_date: start, note: note.trim() || null }).select("id").maybeSingle();
    setBusy(false);
    if (er || !data) return setMsg({ ok: false, text: `No s'ha pogut desar: ${er?.message ?? "torna-ho a provar"}` });
    setPid("");
    setNote("");
    setMsg({ ok: true, text: `${name(pid)} consta com a lesionada. Ja pot omplir els entrenaments a part.` });
    load();
  }

  async function discharge(i: Injury) {
    const { data, error: er } = await supabase().from("injuries").update({ end_date: today < i.start_date ? i.start_date : today }).eq("id", i.id).select("id");
    if (er || !data?.length) return setMsg({ ok: false, text: `No s'ha pogut donar d'alta: ${er?.message ?? "torna-ho a provar"}` });
    setMsg({ ok: true, text: `${name(i.player_id)} donada d'alta (avui és l'últim dia de lesió).` });
    load();
  }

  async function remove(i: Injury) {
    if (!window.confirm(`Esborrar la lesió de ${name(i.player_id)}? (Si era un error.)`)) return;
    const { data, error: er } = await supabase().from("injuries").delete().eq("id", i.id).select("id");
    if (er || !data?.length) return setMsg({ ok: false, text: `No s'ha pogut esborrar: ${er?.message ?? "torna-ho a provar"}` });
    load();
  }

  return (
    <section className="card">
      <h2>Lesionades</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Les jugadores lesionades poden omplir un wellness i un RPE els dies que entrenen a part (recuperació, readaptació, fisio…).
      </p>
      {error && <p className="msg error">{error}</p>}

      <form className="stack" onSubmit={add}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <div style={{ flex: 1.4 }}>
            <label className="field" htmlFor="ipl">Jugadora</label>
            <select id="ipl" value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">— Tria —</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="field" htmlFor="ist">Des del</label>
            <input id="ist" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="field" htmlFor="inote">Nota (opcional, la mínima)</label>
          <input id="inote" type="text" maxLength={200} placeholder="Ex.: turmell" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn block" disabled={busy}>{busy ? "Desant…" : "Marcar com a lesionada"}</button>
      </form>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}

      {!injuries && !error && <p className="muted">Carregant…</p>}
      {injuries && active.length === 0 && <p className="muted" style={{ marginBottom: 0 }}>Ara mateix no hi ha cap lesionada.</p>}
      {active.length > 0 && (
        <ul className="list">
          {active.map((i) => {
            const mine = rehab.filter((r) => r.player_id === i.player_id).slice(0, 5);
            return (
              <li key={i.id}>
                <div className="row between">
                  <span>
                    <b>{name(i.player_id)}</b> <span className="muted small">· des del {fmtDate(i.start_date)}{i.note ? ` · ${i.note}` : ""}</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn small" onClick={() => discharge(i)}>Donar d&apos;alta</button>
                    <button className="btn small secondary" onClick={() => remove(i)}>Esborrar</button>
                  </span>
                </div>
                {mine.length > 0 ? (
                  <div className="table-wrap" style={{ marginTop: 6 }}>
                    <table className="stats-table">
                      <thead>
                        <tr><th>Dia</th><th>Tipus</th><th title="Wellness">Well.</th><th title="Dolor de la lesió">Dolor</th><th>RPE</th><th title="RPE × minuts">Càrrega</th></tr>
                      </thead>
                      <tbody>
                        {mine.map((r) => (
                          <tr key={r.id}>
                            <td>{r.entry_date.slice(8, 10)}/{r.entry_date.slice(5, 7)}</td>
                            <td>{r.kind}</td>
                            <td>{r.score != null ? Number(r.score).toFixed(1) : "–"}</td>
                            <td>{r.pain ?? "–"}</td>
                            <td>{r.rpe ?? "–"}</td>
                            <td>{r.load ?? "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted small" style={{ margin: "4px 0 0" }}>Encara no ha omplert cap entrenament a part (últims 14 dies).</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 0 && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          Altes recents: {recent.map((i) => `${name(i.player_id)} (${i.end_date!.slice(8, 10)}/${i.end_date!.slice(5, 7)})`).join(" · ")}
        </p>
      )}
    </section>
  );
}
