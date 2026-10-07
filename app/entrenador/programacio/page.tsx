"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { WEEKDAYS_SHORT } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, fmtSessionTime, friendlyError, todayMadrid, type Kind, type SessionRule } from "@/lib/wellness";

export default function RulesPage() {
  return (
    <>
      <CoachShell>{() => <Rules />}</CoachShell>
      <Footer />
    </>
  );
}

const RULE_COLS = "id, name, kind, weekdays, start_time, duration_min, start_date, end_date, active";

function fetchRules() {
  const sb = supabase();
  return fetchAll<SessionRule>((f, t) =>
    sb.from("session_rules").select(RULE_COLS).order("active", { ascending: false }).order("created_at", { ascending: false }).order("id").range(f, t),
  );
}

function daysText(days: number[]) {
  return [...days].sort().map((d) => WEEKDAYS_SHORT[d - 1]).join(", ");
}

function Rules() {
  const [rules, setRules] = useState<SessionRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => fetchRules().then(setRules, (e) => setError(e instanceof Error ? e.message : String(e))),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <h1>Programacions</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Cada programació crea sola les sessions al calendari de les properes 6 setmanes, i les va afegint a mesura que passen els dies.
      </p>
      <NewRule onCreated={load} />
      <section className="card">
        <h2>Programacions actuals</h2>
        {error && <p className="msg error">{friendlyError(error)}</p>}
        {rules === null && !error && <p className="muted">Carregant…</p>}
        {rules?.length === 0 && <p className="muted" style={{ margin: 0 }}>Encara no n&apos;hi ha cap.</p>}
        <ul className="list">
          {rules?.map((r) => <RuleRow key={r.id} rule={r} onChange={load} />)}
        </ul>
      </section>
    </>
  );
}

function RuleRow({ rule, onChange }: { rule: SessionRule; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function toggle() {
    setBusy(true);
    setMsg(null);
    try {
      const sb = supabase();
      const { data, error } = await sb.from("session_rules").update({ active: !rule.active }).eq("id", rule.id).select("id");
      if (error || !data?.length) throw new Error(error?.message ?? "No s'ha pogut canviar.");
      const res = await sb.rpc("refresh_rule", { rid: rule.id });
      if (res.error) throw new Error(res.error.message);
      setMsg({ ok: true, text: rule.active ? "Pausada. S'han tret les sessions futures sense respostes." : "Reactivada. Sessions afegides al calendari." });
      onChange();
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Esborrar la programació "${rule.name}"? Es trauran del calendari les sessions futures que encara no tinguin respostes. Les que ja en tenen es queden.`)) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase().rpc("refresh_rule", { rid: rule.id, remove_rule: true });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendlyError(error.message) });
    onChange();
  }

  return (
    <li>
      <div className="row between">
        <b>{rule.name}</b>
        <span className={`chip ${rule.active ? "fet" : "pendent"}`}>{rule.active ? "Activa" : "Pausada"}</span>
      </div>
      <div className="muted small">
        {rule.kind} · {daysText(rule.weekdays)}
        {rule.start_time ? ` · ${fmtSessionTime(rule.start_time)}` : ""}
        {rule.duration_min ? ` · ${rule.duration_min} min` : ""}
      </div>
      <div className="muted small">
        Des del {fmtDate(rule.start_date).toLowerCase()}
        {rule.end_date ? ` fins al ${fmtDate(rule.end_date).toLowerCase()}` : " (sense data final)"}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small secondary" disabled={busy} onClick={toggle}>{rule.active ? "Pausar" : "Reactivar"}</button>
        <button className="btn small danger" disabled={busy} onClick={remove}>Esborrar</button>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </li>
  );
}

function NewRule({ onCreated }: { onCreated: () => void }) {
  const today = todayMadrid();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("Entrenament");
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("90");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggleDay = (d: number) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMsg({ ok: false, text: "Posa un nom (p. ex. «Entrenament de força»)." });
    if (days.length === 0) return setMsg({ ok: false, text: "Tria com a mínim un dia de la setmana." });
    const mins = duration ? Number(duration) : null;
    if (mins != null && !(mins >= 1 && mins <= 300)) return setMsg({ ok: false, text: "La durada ha de ser d'1 a 300 minuts." });
    if (end && end < start) return setMsg({ ok: false, text: "La data final no pot ser anterior a la inicial." });
    setBusy(true);
    setMsg(null);
    try {
      const sb = supabase();
      const { data, error } = await sb
        .from("session_rules")
        .insert({ name: name.trim(), kind, weekdays: [...days].sort(), start_time: time || null, duration_min: mins, start_date: start, end_date: end || null })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "No s'ha confirmat la creació.");
      const gen = await sb.rpc("generate_rule_sessions");
      if (gen.error) throw new Error(gen.error.message);
      setMsg({ ok: true, text: `Programació creada: ${gen.data} sessions noves al calendari.` });
      setName("");
      setDays([]);
      onCreated();
    } catch (err) {
      setMsg({ ok: false, text: friendlyError(err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={create}>
      <h2>Nova programació</h2>
      <div className="toggle" role="group" aria-label="Tipus">
        {(["Entrenament", "Partit"] as Kind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k}
          </button>
        ))}
      </div>
      <div>
        <label className="field" htmlFor="rname">Nom</label>
        <input id="rname" type="text" maxLength={80} placeholder="Ex.: Entrenament de força" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="field">Dies de la setmana</label>
        <div className="weekdays" role="group" aria-label="Dies de la setmana">
          {WEEKDAYS_SHORT.map((d, i) => (
            <button key={d} type="button" aria-pressed={days.includes(i + 1)} onClick={() => toggleDay(i + 1)}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="rtime">Hora (opcional)</label>
          <input id="rtime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="rdur">Durada (min)</label>
          <input id="rdur" type="text" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="rstart">Des del</label>
          <input id="rstart" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="rend">Fins al (opcional)</label>
          <input id="rend" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <button className="btn block" disabled={busy}>{busy ? "Creant…" : "Crear programació"}</button>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </form>
  );
}
