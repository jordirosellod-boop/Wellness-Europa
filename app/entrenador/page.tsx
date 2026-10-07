"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtSessionTime, friendlyError, todayMadrid, type Kind, type Session } from "@/lib/wellness";

export default function CoachSessionsPage() {
  const [reload, setReload] = useState(0);
  return (
    <>
      <CoachShell>
        {() => (
          <>
            <NewSession onCreated={() => setReload((n) => n + 1)} />
            <SessionList key={reload} />
          </>
        )}
      </CoachShell>
      <Footer />
    </>
  );
}

function NewSession({ onCreated }: { onCreated: () => void }) {
  const [date, setDate] = useState(todayMadrid());
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<Kind>("Entrenament");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMsg({ ok: false, text: "Posa un nom a la sessió." });
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase()
        .from("sessions")
        .insert({ session_date: date, start_time: time || null, kind, name: name.trim() })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("No s'ha confirmat la creació.");
      setMsg({ ok: true, text: `Sessió creada: ${name.trim()} (${fmtDate(date)}).` });
      setName("");
      setTime("");
      onCreated();
    } catch (err) {
      setMsg({ ok: false, text: friendlyError(err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={create}>
      <h2>Nova sessió</h2>
      <div className="toggle" role="group" aria-label="Tipus">
        {(["Entrenament", "Partit"] as Kind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k}
          </button>
        ))}
      </div>
      <div>
        <label className="field" htmlFor="sname">Nom</label>
        <input
          id="sname"
          type="text"
          maxLength={80}
          placeholder={kind === "Partit" ? "Ex.: Partit vs. Sant Andreu" : "Ex.: Entrenament dimarts"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="sdate">Data</label>
          <input id="sdate" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="stime">Hora (opcional)</label>
          <input id="stime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <button className="btn block" disabled={busy}>{busy ? "Creant…" : "Crear sessió"}</button>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </form>
  );
}

const PAGE = 20;

function fetchSessions(from: number) {
  return supabase()
    .from("sessions")
    .select("id, session_date, start_time, kind, name")
    .order("session_date", { ascending: false })
    .order("start_time", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE - 1);
}

function SessionList() {
  const today = todayMadrid();
  const [rows, setRows] = useState<Session[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((from: number, res: Awaited<ReturnType<typeof fetchSessions>>) => {
    setBusy(false);
    if (res.error) return setError(res.error.message);
    const data = (res.data ?? []) as Session[];
    setRows((prev) => (from === 0 ? data : [...prev, ...data]));
    setMore(data.length === PAGE);
  }, []);

  useEffect(() => {
    fetchSessions(0).then((res) => apply(0, res));
  }, [apply]);

  function loadMore() {
    const from = rows.length;
    setBusy(true);
    fetchSessions(from).then((res) => apply(from, res));
  }

  return (
    <section className="card">
      <h2>Sessions</h2>
      {error && <p className="msg error">{error}</p>}
      {!busy && rows.length === 0 && !error && <p className="muted" style={{ margin: 0 }}>Encara no hi ha cap sessió.</p>}
      <ul className="list">
        {rows.map((s) => (
          <li key={s.id}>
            <Link className="item" href={`/entrenador/sessio?id=${s.id}`}>
              <div className="row between">
                <b>{s.name}</b>
                <span className="row">
                  {s.session_date === today && <span className="chip fet">Avui</span>}
                  <span className="chip">{s.kind}</span>
                </span>
              </div>
              <div className="muted small">
                {fmtDate(s.session_date, { year: true })}
                {s.start_time ? ` · ${fmtSessionTime(s.start_time)}` : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {more && rows.length > 0 && (
        <button className="btn secondary block" style={{ marginTop: 12 }} disabled={busy} onClick={loadMore}>
          {busy ? "Carregant…" : "Veure'n més"}
        </button>
      )}
    </section>
  );
}
