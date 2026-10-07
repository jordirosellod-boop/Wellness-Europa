"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { centsToInput, FINE_COLS, fmtEuros, parseEuros, type Fine, type FineRule } from "@/lib/fines";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, friendlyError, todayMadrid, type Profile } from "@/lib/wellness";

export default function FinesPage() {
  return (
    <>
      <CoachShell>{() => <Fines />}</CoachShell>
      <Footer />
    </>
  );
}

type Data = { people: Profile[]; fines: Fine[]; rules: FineRule[] };

async function fetchData(): Promise<Data> {
  const sb = supabase();
  // Tot paginat i amb ordre fix (límit de 1.000 files de Supabase).
  const [people, fines, rules] = await Promise.all([
    fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").order("display_name").order("id").range(f, t)),
    fetchAll<Fine>((f, t) => sb.from("fines").select(FINE_COLS).order("fine_date", { ascending: false }).order("id").range(f, t)),
    fetchAll<FineRule>((f, t) => sb.from("fine_rules").select("id, name, amount_cents, active").order("name").order("id").range(f, t)),
  ]);
  return { people, fines, rules };
}

function Fines() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => fetchData().then(setData, (e) => setError(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="msg error">{friendlyError(error)}</p>;
  if (!data) return <p className="muted">Carregant…</p>;

  const total = data.fines.reduce((a, f) => a + f.amount_cents, 0);
  const paid = data.fines.filter((f) => f.paid).reduce((a, f) => a + f.amount_cents, 0);

  const byPerson = new Map<string, Fine[]>();
  for (const f of data.fines) byPerson.set(f.person_id, [...(byPerson.get(f.person_id) ?? []), f]);
  const pendingOf = (id: string) => (byPerson.get(id) ?? []).filter((f) => !f.paid).reduce((a, f) => a + f.amount_cents, 0);
  const withFines = data.people.filter((p) => byPerson.has(p.id)).sort((a, b) => pendingOf(b.id) - pendingOf(a.id));

  return (
    <>
      <h1>Multes</h1>
      <section className="card">
        <h2>Pot de l&apos;equip</h2>
        <div className="stats three">
          <div className="stat">
            Total multes
            <b>{fmtEuros(total)}</b>
            <span className="small">{data.fines.length} multes</span>
          </div>
          <div className="stat">
            Pagat (al pot)
            <b style={{ color: "var(--verd)" }}>{fmtEuros(paid)}</b>
          </div>
          <div className="stat">
            Pendent
            <b style={{ color: total - paid ? "var(--taronja)" : undefined }}>{fmtEuros(total - paid)}</b>
          </div>
        </div>
      </section>

      <NewFine people={data.people} rules={data.rules.filter((r) => r.active)} onDone={load} />

      <section className="card">
        <h2>Per persona</h2>
        {withFines.length === 0 && <p className="muted" style={{ margin: 0 }}>Encara no hi ha cap multa.</p>}
        <ul className="list">
          {withFines.map((p) => (
            <PersonFines key={p.id} person={p} fines={byPerson.get(p.id)!} onChange={load} />
          ))}
        </ul>
      </section>

      <Rules rules={data.rules} onChange={load} />
    </>
  );
}

function NewFine({ people, rules, onDone }: { people: Profile[]; rules: FineRule[]; onDone: () => void }) {
  const [person, setPerson] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayMadrid());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function pickRule(id: string) {
    setRuleId(id);
    const r = rules.find((x) => x.id === id);
    if (r) {
      setReason(r.name);
      setAmount(centsToInput(r.amount_cents));
    } else {
      setReason("");
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    if (!person) return setMsg({ ok: false, text: "Tria a qui poses la multa." });
    if (!reason.trim()) return setMsg({ ok: false, text: "Tria una norma o escriu el motiu." });
    if (cents == null) return setMsg({ ok: false, text: "L'import no és vàlid (per exemple: 2 o 2,50)." });
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase()
        .from("fines")
        .insert({ person_id: person, rule_id: ruleId || null, reason: reason.trim(), amount_cents: cents, fine_date: date, notes: notes.trim() || null })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "No s'ha confirmat.");
      const who = people.find((p) => p.id === person)?.display_name ?? "";
      setMsg({ ok: true, text: `Multa posada: ${who}, ${reason.trim()}, ${fmtEuros(cents)}.` });
      setPerson("");
      setNotes("");
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: friendlyError(err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  const players = people.filter((p) => p.role === "player");
  const staff = people.filter((p) => p.role === "coach");

  return (
    <form className="card stack" onSubmit={create}>
      <h2>Posar una multa</h2>
      <div>
        <label className="field" htmlFor="fperson">A qui</label>
        <select id="fperson" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Tria una persona…</option>
          <optgroup label="Jugadores">
            {players.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </optgroup>
          <optgroup label="Staff">
            {staff.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </optgroup>
        </select>
      </div>
      <div>
        <label className="field" htmlFor="frule">Norma</label>
        <select id="frule" value={ruleId} onChange={(e) => pickRule(e.target.value)}>
          <option value="">Altres (escriure el motiu)</option>
          {rules.map((r) => <option key={r.id} value={r.id}>{r.name} · {fmtEuros(r.amount_cents)}</option>)}
        </select>
      </div>
      {!ruleId && (
        <div>
          <label className="field" htmlFor="freason">Motiu</label>
          <input id="freason" type="text" maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="famount">Import (€)</label>
          <input id="famount" type="text" inputMode="decimal" placeholder="2,50" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="fdate">Data</label>
          <input id="fdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field" htmlFor="fnotes">Nota (opcional)</label>
        <input id="fnotes" type="text" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn block" disabled={busy}>{busy ? "Desant…" : "Posar multa"}</button>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </form>
  );
}

function PersonFines({ person, fines, onChange }: { person: Profile; fines: Fine[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = fines.filter((f) => !f.paid).reduce((a, f) => a + f.amount_cents, 0);
  const paid = fines.filter((f) => f.paid).reduce((a, f) => a + f.amount_cents, 0);

  async function setPaid(f: Fine, value: boolean) {
    setBusy(f.id);
    setError(null);
    const { data, error } = await supabase().from("fines").update({ paid: value }).eq("id", f.id).select("id");
    setBusy(null);
    if (error || !data?.length) return setError(friendlyError(error?.message ?? "No s'ha pogut desar."));
    onChange();
  }

  async function remove(f: Fine) {
    if (!confirm(`Esborrar la multa "${f.reason}" (${fmtEuros(f.amount_cents)}) de ${person.display_name}?`)) return;
    setBusy(f.id);
    setError(null);
    const { data, error } = await supabase().from("fines").delete().eq("id", f.id).select("id");
    setBusy(null);
    if (error || !data?.length) return setError(friendlyError(error?.message ?? "No s'ha pogut esborrar."));
    onChange();
  }

  return (
    <li>
      <button type="button" className="fine-person" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <b>{person.display_name}</b>
          {person.role === "coach" && <span className="muted small"> · staff</span>}
        </span>
        <span className="row" style={{ gap: 6 }}>
          {pending > 0 ? <span className="chip pendent">Deu {fmtEuros(pending)}</span> : <span className="chip fet">Al dia</span>}
          <span className="muted small">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {paid > 0 && <div className="muted small">Ha pagat {fmtEuros(paid)}</div>}
      {open && (
        <ul className="list" style={{ marginTop: 8 }}>
          {fines.map((f) => (
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
              <div className="row" style={{ marginTop: 6 }}>
                {f.paid ? (
                  <button className="btn small secondary" disabled={busy === f.id} onClick={() => setPaid(f, false)}>Desfer pagament</button>
                ) : (
                  <button className="btn small" disabled={busy === f.id} onClick={() => setPaid(f, true)}>Marcar pagada</button>
                )}
                <button className="btn small danger" disabled={busy === f.id} onClick={() => remove(f)}>Esborrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="msg error">{error}</p>}
    </li>
  );
}

function Rules({ rules, onChange }: { rules: FineRule[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    if (!name.trim()) return setMsg({ ok: false, text: "Escriu la norma." });
    if (cents == null) return setMsg({ ok: false, text: "L'import no és vàlid (per exemple: 2 o 2,50)." });
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase().from("fine_rules").insert({ name: name.trim(), amount_cents: cents }).select("id").single();
    setBusy(false);
    if (error || !data) return setMsg({ ok: false, text: friendlyError(error?.message ?? "No s'ha confirmat.") });
    setName("");
    setAmount("");
    onChange();
  }

  async function toggle(r: FineRule) {
    const { data, error } = await supabase().from("fine_rules").update({ active: !r.active }).eq("id", r.id).select("id");
    if (error || !data?.length) return setMsg({ ok: false, text: friendlyError(error?.message ?? "No s'ha pogut desar.") });
    onChange();
  }

  async function remove(r: FineRule) {
    if (!confirm(`Esborrar la norma "${r.name}"? Les multes ja posades es conserven.`)) return;
    const { data, error } = await supabase().from("fine_rules").delete().eq("id", r.id).select("id");
    if (error || !data?.length) return setMsg({ ok: false, text: friendlyError(error?.message ?? "No s'ha pogut esborrar.") });
    onChange();
  }

  return (
    <section className="card">
      <h2>Normes</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Les jugadores veuen les normes actives a la seva pantalla.</p>
      {rules.length === 0 && <p className="muted">Encara no n&apos;hi ha cap.</p>}
      <ul className="list">
        {rules.map((r) => (
          <li key={r.id}>
            <div className="row between">
              <span style={{ opacity: r.active ? 1 : 0.55 }}>
                <b>{r.name}</b> · {fmtEuros(r.amount_cents)}
              </span>
              {!r.active && <span className="chip pendent">Desactivada</span>}
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn small secondary" onClick={() => toggle(r)}>{r.active ? "Desactivar" : "Activar"}</button>
              <button className="btn small danger" onClick={() => remove(r)}>Esborrar</button>
            </div>
          </li>
        ))}
      </ul>
      <form className="stack" style={{ marginTop: 16 }} onSubmit={add}>
        <h3>Afegir norma</h3>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <div style={{ flex: 2 }}>
            <label className="field" htmlFor="rname">Norma</label>
            <input id="rname" type="text" maxLength={80} placeholder="Arribar tard" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field" htmlFor="ramount">Import (€)</label>
            <input id="ramount" type="text" inputMode="decimal" placeholder="2" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <button className="btn secondary block" disabled={busy}>{busy ? "Afegint…" : "Afegir norma"}</button>
        {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
      </form>
    </section>
  );
}
