"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { DrillEditor, DrillView } from "@/components/drill-editor";
import { CoachShell, Footer } from "@/components/ui";
import { escapulada } from "@/lib/fonts";
import {
  CONTENTS, fetchPlans, newTask, PLAN_COLS, POSITION_NAMES, POSITIONS, STATUS_LABEL, TASK_TYPES,
  type Plan, type PlayerStatus, type Position, type Task,
} from "@/lib/plan";
import { activeOn, fetchInjuries } from "@/lib/rehab";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, todayMadrid, type Profile } from "@/lib/wellness";

export default function PlansPage() {
  return (
    <>
      <CoachShell>{() => <Plans />}</CoachShell>
      <Footer />
    </>
  );
}

function useQueryId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setId(new URLSearchParams(window.location.search).get("id"));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const go = (next: string | null) => {
    window.history.pushState(null, "", next ? `?id=${next}` : window.location.pathname);
    setId(next);
    window.scrollTo({ top: 0 });
  };
  return [id, go];
}

function Plans() {
  const [id, go] = useQueryId();
  return id ? <PlanEditor key={id} id={id} onBack={() => go(null)} onOpen={go} /> : <PlanList onOpen={go} />;
}

// ---------------------------------------------------------------------------
// Llista i creació
// ---------------------------------------------------------------------------

type Roster = { players: Profile[]; positions: Map<string, Position> };

async function fetchRoster(): Promise<Roster> {
  const sb = supabase();
  const [players, pos] = await Promise.all([
    fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").eq("role", "player").order("display_name").order("id").range(f, t)),
    fetchAll<{ profile_id: string; position: Position }>((f, t) => sb.from("player_positions").select("profile_id, position").order("profile_id").range(f, t)),
  ]);
  return { players, positions: new Map(pos.map((p) => [p.profile_id, p.position])) };
}

/** Disponibles automàticament: totes menys les lesionades aquell dia. */
async function autoStatuses(date: string, players: Profile[]): Promise<Record<string, PlayerStatus>> {
  const injuries = await fetchInjuries();
  return Object.fromEntries(players.map((p) => [p.id, injuries.some((i) => i.player_id === p.id && activeOn(i, date)) ? "les" : "disp"]));
}

function shortTeam(name: string) {
  return name.replace(/,?\s+(C\.E\.|U\.E\.|C\.F\.|A\.D\.|C\.D\.|U\.D\.|F\.C\.)\s*/g, " ").replace(/\s+[A-Z]$/, "").replace(/\s+/g, " ").trim();
}

/** Omple sola la capçalera: sessió del calendari, proper partit (rival, jornada, MD-n) i número de sessió. */
async function prefill(date: string): Promise<Partial<Plan>> {
  const sb = supabase();
  const [ses, next, count] = await Promise.all([
    sb.from("sessions").select("id, start_time, duration_min").eq("session_date", date).eq("kind", "Entrenament").eq("cancelled", false).order("start_time").order("id").range(0, 0),
    sb.from("fcf_matches").select("jornada, kickoff, home, away, is_home").eq("closed", false).gte("kickoff", `${date}T00:00:00`).order("kickoff").order("acta_id").range(0, 0),
    sb.from("sessions").select("id", { count: "exact", head: true }).eq("kind", "Entrenament").eq("cancelled", false).lte("session_date", date),
  ]);
  const s = (ses.data ?? [])[0] as { id: string; start_time: string | null; duration_min: number | null } | undefined;
  const m = (next.data ?? [])[0] as { jornada: number; kickoff: string; home: string; away: string; is_home: boolean } | undefined;
  const md = m?.kickoff ? Math.round((Date.parse(`${m.kickoff.slice(0, 10)}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 864e5) : null;
  return {
    session_id: s?.id ?? null,
    start_time: s?.start_time ?? null,
    duration_min: s?.duration_min ?? 90,
    rival: m ? shortTeam(m.is_home ? m.away : m.home) : null,
    jornada: m ? `J${m.jornada}` : null,
    microcycle: md != null && md >= 0 && md <= 7 ? `MD-${md}` : null,
    session_no: count.count ? String(count.count) : null,
  };
}

function PlanList({ onOpen }: { onOpen: (id: string) => void }) {
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof fetchPlans>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayMadrid());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPlans().then(setPlans, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const [pre, roster] = await Promise.all([prefill(date), fetchRoster()]);
      const players = await autoStatuses(date, roster.players);
      const { data, error: e } = await supabase()
        .from("training_plans")
        .insert({ plan_date: date, ...pre, players, tasks: [newTask(), newTask(), newTask(), newTask()] })
        .select("id")
        .maybeSingle();
      if (e || !data) throw new Error(e?.message ?? "No s'ha pogut crear.");
      onOpen(data.id as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Plantilles</h1>
        <span className="chip">Només tu</span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>Les teves sessions d&apos;entrenament. Ningú més les veu (ni la resta del staff).</p>
      <section className="card">
        <h2>Nova sessió</h2>
        <div className="row" style={{ flexWrap: "nowrap", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="field" htmlFor="pdate">Dia</label>
            <input id="pdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="btn" disabled={busy || !date} onClick={create}>{busy ? "Creant…" : "Crear"}</button>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          S&apos;omple sol: hora i durada del calendari, rival i jornada del proper partit, i les jugadores disponibles (les lesionades surten marcades).
        </p>
      </section>
      {error && <p className="msg error">{error}</p>}
      {!plans && !error && <p className="muted">Carregant…</p>}
      {plans && plans.length > 0 && (
        <section className="card">
          <h2>Les meves plantilles</h2>
          <ul className="list">
            {plans.map((p) => (
              <li key={p.id} className="row between">
                <span>
                  <b>{fmtDate(p.plan_date)}</b>
                  <span className="muted small">{p.session_no ? ` · Sessió ${p.session_no}` : ""}{p.rival ? ` · vs ${p.rival}` : ""}</span>
                </span>
                <button className="btn small" onClick={() => onOpen(p.id)}>Obrir</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function PlanEditor({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editPos, setEditPos] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase().from("training_plans").select(PLAN_COLS).eq("id", id).maybeSingle(),
      fetchRoster(),
    ]).then(
      ([p, r]) => {
        if (p.error) return setError(p.error.message);
        if (!p.data) return setError("No s'ha trobat la plantilla (o no és teva).");
        setPlan(p.data as Plan);
        setRoster(r);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [id]);

  // Avisa si es tanca la pàgina amb canvis sense desar.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const upd = useCallback((patch: Partial<Plan>) => {
    setPlan((p) => p && { ...p, ...patch });
    setDirty(true);
    setStatus(null);
  }, []);
  const updTask = (i: number, patch: Partial<Task>) => plan && upd({ tasks: plan.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  /** Desa; només diu "Desat" quan el servidor ho confirma. */
  async function save() {
    if (!plan) return;
    setSaving(true);
    setStatus(null);
    const { id: _id, updated_at: _u, ...row } = plan;
    void _id; void _u;
    const { data, error: e } = await supabase().from("training_plans").update(row).eq("id", plan.id).select("updated_at").maybeSingle();
    setSaving(false);
    if (e || !data) return setStatus({ ok: false, text: `No s'ha pogut desar: ${e?.message ?? "torna-ho a provar"}` });
    setDirty(false);
    setStatus({ ok: true, text: "Desat ✓" });
  }

  async function refreshPlayers() {
    if (!plan || !roster) return;
    const auto = await autoStatuses(plan.plan_date, roster.players);
    // Les que ja havies marcat com a "a part" o "baixa" es queden; la resta s'actualitza.
    const next = Object.fromEntries(
      Object.entries(auto).map(([pid, s]) => [pid, s === "les" ? "les" : plan.players[pid] === "baixa" || plan.players[pid] === "part" ? plan.players[pid] : s]),
    ) as Record<string, PlayerStatus>;
    upd({ players: next });
  }

  async function setPosition(pid: string, pos: Position | "") {
    const sb = supabase();
    const { error: e } = pos
      ? await sb.from("player_positions").upsert({ profile_id: pid, position: pos, updated_at: new Date().toISOString() }).select("profile_id").single()
      : await sb.from("player_positions").delete().eq("profile_id", pid);
    if (e) return setStatus({ ok: false, text: `No s'ha pogut desar la posició: ${e.message}` });
    setRoster((r) => {
      if (!r) return r;
      const m = new Map(r.positions);
      if (pos) m.set(pid, pos);
      else m.delete(pid);
      return { ...r, positions: m };
    });
  }

  async function duplicate() {
    if (!plan) return;
    if (dirty && !window.confirm("Hi ha canvis sense desar. Duplicar igualment (sense aquests canvis)?")) return;
    const { id: _i, updated_at: _u, ...row } = plan;
    void _i; void _u;
    const { data, error: e } = await supabase().from("training_plans").insert({ ...row, session_id: null }).select("id").maybeSingle();
    if (e || !data) return setStatus({ ok: false, text: `No s'ha pogut duplicar: ${e?.message ?? ""}` });
    onOpen(data.id as string);
  }

  async function remove() {
    if (!plan || !window.confirm("Esborrar aquesta plantilla?")) return;
    const { data, error: e } = await supabase().from("training_plans").delete().eq("id", plan.id).select("id");
    if (e || !data?.length) return setStatus({ ok: false, text: `No s'ha pogut esborrar: ${e?.message ?? ""}` });
    setDirty(false);
    onBack();
  }

  if (error) return (<><p className="msg error">{error}</p><button className="btn small secondary" onClick={onBack}>← Tornar</button></>);
  if (!plan || !roster) return <p className="muted">Carregant…</p>;

  const statusOf = (pid: string): PlayerStatus => plan.players[pid] ?? "disp";
  const available = roster.players.filter((p) => statusOf(p.id) === "disp");

  return (
    <div className={`plan ${escapulada.variable}`}>
      <div className="row between no-print">
        <button className="btn small secondary" onClick={() => (!dirty || window.confirm("Hi ha canvis sense desar. Sortir igualment?")) && onBack()}>← Plantilles</button>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn small secondary" onClick={duplicate}>Duplicar</button>
          <button className="btn small secondary" onClick={remove}>Esborrar</button>
        </span>
      </div>

      <div className="plan-savebar no-print">
        <span className={status && !status.ok ? "err" : ""}>{status ? status.text : dirty ? "Canvis sense desar" : "Tot desat"}</span>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn small" disabled={saving || !dirty} onClick={save}>{saving ? "Desant…" : "Desar"}</button>
          <button className="btn small secondary" onClick={() => window.print()} title="Imprimir o desar en PDF per enviar">🖨 PDF / Imprimir</button>
        </span>
      </div>

      {/* ---------- Edició (pantalla) ---------- */}
      <div className="no-print">
        <section className="card">
          <h2 className="esc">Sessió</h2>
          <div className="plan-grid">
            <Field label="Dia"><input type="date" value={plan.plan_date} onChange={(e) => upd({ plan_date: e.target.value })} /></Field>
            <Field label="Hora"><input type="time" value={plan.start_time?.slice(0, 5) ?? ""} onChange={(e) => upd({ start_time: e.target.value || null })} /></Field>
            <Field label="Sessió"><input type="text" maxLength={20} value={plan.session_no ?? ""} onChange={(e) => upd({ session_no: e.target.value || null })} /></Field>
            <Field label="Jornada"><input type="text" maxLength={40} placeholder="Ex.: J5 / Pretemporada" value={plan.jornada ?? ""} onChange={(e) => upd({ jornada: e.target.value || null })} /></Field>
            <Field label="Rival"><input type="text" maxLength={80} value={plan.rival ?? ""} onChange={(e) => upd({ rival: e.target.value || null })} /></Field>
            <Field label="Temps (min)"><input type="text" inputMode="numeric" value={plan.duration_min ?? ""} onChange={(e) => upd({ duration_min: Number(e.target.value.replace(/\D/g, "")) || null })} /></Field>
            <Field label="Microcicle"><input type="text" maxLength={40} placeholder="Ex.: MD-3" value={plan.microcycle ?? ""} onChange={(e) => upd({ microcycle: e.target.value || null })} /></Field>
            <Field label="Mesocicle"><input type="text" maxLength={40} value={plan.mesocycle ?? ""} onChange={(e) => upd({ mesocycle: e.target.value || null })} /></Field>
          </div>
          <label className="field" style={{ marginTop: 10 }}>Continguts de la sessió</label>
          <div className="weekdays wrap" role="group" aria-label="Continguts">
            {CONTENTS.map((c) => (
              <button key={c} type="button" aria-pressed={plan.contents.includes(c)}
                onClick={() => upd({ contents: plan.contents.includes(c) ? plan.contents.filter((x) => x !== c) : [...plan.contents, c] })}>
                {c}
              </button>
            ))}
          </div>
          <Field label="Observacions"><textarea maxLength={600} placeholder="Ex.: Entreno 1:30h Nou Sardenya" value={plan.observations ?? ""} onChange={(e) => upd({ observations: e.target.value || null })} /></Field>
          <Field label="Puntuació (general)"><textarea maxLength={600} value={plan.score_notes ?? ""} onChange={(e) => upd({ score_notes: e.target.value || null })} /></Field>
        </section>

        <section className="card">
          <div className="row between">
            <h2 className="esc" style={{ margin: 0 }}>Jugadores <span className="muted small">{available.length} disponibles</span></h2>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn small secondary" onClick={refreshPlayers}>↻ Actualitzar</button>
              <button className="btn small secondary" onClick={() => setEditPos((v) => !v)}>{editPos ? "Fet" : "Posicions"}</button>
            </span>
          </div>
          <p className="muted small">Toca una jugadora per canviar-ne l&apos;estat: disponible → a part → baixa. Les lesionades surten soles.</p>
          {editPos ? (
            <ul className="pos-edit">
              {roster.players.map((p) => (
                <li key={p.id}>
                  <span>{p.display_name}</span>
                  <select value={roster.positions.get(p.id) ?? ""} onChange={(e) => setPosition(p.id, e.target.value as Position | "")} aria-label={`Posició de ${p.display_name}`}>
                    <option value="">—</option>
                    {POSITIONS.map((x) => <option key={x} value={x}>{x} · {POSITION_NAMES[x]}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          ) : (
            <PositionBoard plan={plan} roster={roster} onToggle={(pid) => {
              const cur = statusOf(pid);
              if (cur === "les") return;
              const next: PlayerStatus = cur === "disp" ? "part" : cur === "part" ? "baixa" : "disp";
              upd({ players: { ...plan.players, [pid]: next } });
            }} />
          )}
        </section>

        {plan.tasks.map((t, i) => (
          <TaskEditor
            key={t.id}
            n={i + 1}
            t={t}
            last={i === plan.tasks.length - 1}
            onChange={(patch) => updTask(i, patch)}
            onMove={(d) => {
              const arr = [...plan.tasks];
              const [x] = arr.splice(i, 1);
              arr.splice(i + d, 0, x);
              upd({ tasks: arr });
            }}
            onRemove={() => window.confirm(`Esborrar la tasca ${i + 1}?`) && upd({ tasks: plan.tasks.filter((_, j) => j !== i) })}
          />
        ))}
        <button className="btn block" onClick={() => upd({ tasks: [...plan.tasks, newTask()] })}>+ Afegir tasca</button>
      </div>

      {/* ---------- Full per imprimir / PDF ---------- */}
      <PlanSheet plan={plan} roster={roster} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="field">{label}</label>
      {children}
    </div>
  );
}

/** Jugadores per posicions, amb l'estat de cadascuna i el recompte de disponibles. */
function PositionBoard({ plan, roster, onToggle, print = false }: { plan: Plan; roster: Roster; onToggle?: (pid: string) => void; print?: boolean }) {
  const cols = [...POSITIONS, "—"] as const;
  const by = (c: string) => roster.players.filter((p) => (roster.positions.get(p.id) ?? "—") === c);
  const shown = cols.filter((c) => c !== "—" || by("—").length > 0);
  return (
    <div className={`pos-board${print ? " print" : ""}`} style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
      {shown.map((c) => {
        const list = by(c);
        const avail = list.filter((p) => (plan.players[p.id] ?? "disp") === "disp").length;
        return (
          <div key={c} className="pos-col">
            <b className="esc">{c === "—" ? "Sense pos." : c}</b>
            {list.map((p) => {
              const st = plan.players[p.id] ?? "disp";
              return onToggle ? (
                <button key={p.id} type="button" className={`pchip ${st}`} onClick={() => onToggle(p.id)} title={STATUS_LABEL[st]}>
                  {p.display_name.split(" ")[0]}{st !== "disp" && <i>{st === "les" ? "L" : st === "part" ? "P" : "B"}</i>}
                </button>
              ) : (
                <span key={p.id} className={`pchip ${st}`}>{p.display_name.split(" ")[0]}{st !== "disp" && <i>{st === "les" ? "L" : st === "part" ? "P" : "B"}</i>}</span>
              );
            })}
            <span className="pos-count esc">{avail}</span>
          </div>
        );
      })}
    </div>
  );
}

function TaskEditor({ n, t, last, onChange, onMove, onRemove }: {
  n: number; t: Task; last: boolean; onChange: (p: Partial<Task>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const listId = `tt-${t.id}`;
  async function onImage(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await img.decode();
    const scale = Math.min(1, 1100 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    onChange({ image: c.toDataURL("image/jpeg", 0.82) });
  }
  const txt = (k: keyof Task, label: string, rows = 3) => (
    <Field label={label}>
      <textarea rows={rows} maxLength={1200} value={t[k] as string} onChange={(e) => onChange({ [k]: e.target.value } as Partial<Task>)} />
    </Field>
  );
  return (
    <section className="card task-card">
      <div className="row between">
        <h2 className="esc" style={{ margin: 0 }}>Tasca {n}{t.type ? ` · ${t.type}` : ""}</h2>
        <span className="row" style={{ gap: 4 }}>
          <button className="btn small secondary" disabled={n === 1} onClick={() => onMove(-1)} aria-label="Pujar">↑</button>
          <button className="btn small secondary" disabled={last} onClick={() => onMove(1)} aria-label="Baixar">↓</button>
          <button className="btn small secondary" onClick={onRemove} aria-label="Esborrar tasca">✕</button>
        </span>
      </div>
      <div className="plan-grid" style={{ marginTop: 8 }}>
        <Field label="Tasca">
          <input type="text" list={listId} maxLength={60} value={t.type} onChange={(e) => onChange({ type: e.target.value })} />
          <datalist id={listId}>{TASK_TYPES.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="ID"><input type="text" maxLength={20} value={t.code} onChange={(e) => onChange({ code: e.target.value })} /></Field>
        <Field label="Temps"><input type="text" maxLength={20} placeholder="Ex.: 2x7'" value={t.time} onChange={(e) => onChange({ time: e.target.value })} /></Field>
        <Field label="Total"><input type="text" maxLength={20} placeholder="Ex.: 15'" value={t.total} onChange={(e) => onChange({ total: e.target.value })} /></Field>
        <Field label="Espai"><input type="text" maxLength={30} placeholder="Ex.: 40x25" value={t.space} onChange={(e) => onChange({ space: e.target.value })} /></Field>
        <Field label="Porteres"><input type="text" maxLength={10} value={t.gks} onChange={(e) => onChange({ gks: e.target.value })} /></Field>
      </div>

      <label className="field" style={{ marginTop: 10 }}>Dibuix</label>
      {t.image ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.image} alt="Imatge de l'exercici" className="drill-img" />
          <button className="btn small secondary" style={{ marginTop: 6 }} onClick={() => onChange({ image: null })}>Treure la imatge i dibuixar</button>
        </div>
      ) : (
        <>
          <DrillEditor value={t.diagram} onChange={(d) => onChange({ diagram: d })} />
          <label className="btn small secondary" style={{ marginTop: 6, display: "inline-flex" }}>
            📷 Pujar una imatge en lloc del dibuix
            <input type="file" accept="image/*" onChange={onImage} hidden />
          </label>
        </>
      )}

      {txt("description", "Descripció", 3)}
      {txt("objective", "Objectiu", 2)}
      {txt("rules", "Normes de provocació", 2)}
      {txt("cues", "Consignes", 2)}
      {txt("teams", "Equips", 2)}
      {txt("scoring", "Puntuació", 2)}

      <label className="field" style={{ marginTop: 10 }}>Rols del staff</label>
      {t.staff.map((r, j) => (
        <div key={j} className="row" style={{ flexWrap: "nowrap", gap: 6, marginBottom: 6 }}>
          <input type="text" maxLength={30} placeholder="Qui" value={r.who} onChange={(e) => onChange({ staff: t.staff.map((x, k) => (k === j ? { ...x, who: e.target.value } : x)) })} />
          <input type="text" maxLength={30} placeholder="Rol (dirigeix, porteres…)" value={r.role} onChange={(e) => onChange({ staff: t.staff.map((x, k) => (k === j ? { ...x, role: e.target.value } : x)) })} />
          <input type="text" maxLength={30} placeholder="Altres" value={r.extra} onChange={(e) => onChange({ staff: t.staff.map((x, k) => (k === j ? { ...x, extra: e.target.value } : x)) })} />
          <button className="btn small secondary" aria-label="Treure fila" onClick={() => onChange({ staff: t.staff.filter((_, k) => k !== j) })}>✕</button>
        </div>
      ))}
      <button className="btn small secondary" onClick={() => onChange({ staff: [...t.staff, { who: "", role: "", extra: "" }] })}>+ Fila</button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Full imprimible (A4 horitzontal), com la plantilla del club
// ---------------------------------------------------------------------------

function PlanSheet({ plan, roster }: { plan: Plan; roster: Roster }) {
  const available = roster.players.filter((p) => (plan.players[p.id] ?? "disp") === "disp").length;
  const cell = (k: string, v: ReactNode) => (<div className="ps-cell"><span>{k}</span><b>{v || "–"}</b></div>);
  return (
    <div className="plan-sheet">
      <header className="ps-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escut.png" alt="" width={46} height={46} />
        <div className="ps-title">
          <b className="esc">Club Esportiu Europa</b>
          <span className="esc">Juvenil C 2026/2027 · Sessió d&apos;entrenament</span>
        </div>
      </header>
      <div className="ps-top">
        <div className="ps-info">
          {cell("Dia", fmtDate(plan.plan_date))}
          {cell("Hora", plan.start_time?.slice(0, 5))}
          {cell("Sessió", plan.session_no)}
          {cell("Jornada", plan.jornada)}
          {cell("Rival", plan.rival)}
          {cell("Microcicle", plan.microcycle)}
          {cell("Mesocicle", plan.mesocycle)}
          {cell("Temps", plan.duration_min ? `${plan.duration_min}'` : "")}
          {cell("Jugadores", String(available))}
          {cell("Continguts", plan.contents.join(" · "))}
          <div className="ps-cell wide"><span>Observacions</span><b>{plan.observations || "–"}</b></div>
          <div className="ps-cell wide"><span>Puntuació</span><b>{plan.score_notes || "–"}</b></div>
        </div>
        <PositionBoard plan={plan} roster={roster} print />
      </div>
      <div className="ps-tasks">
        {plan.tasks.map((t, i) => (
          <article key={t.id} className="ps-task">
            <div className="ps-task-head esc">
              <span>Tasca {i + 1}</span><b>{t.type || "–"}</b>
              <span>Temps</span><b>{t.time || "–"}</b>
              <span>ID</span><b>{t.code || "–"}</b>
              <span>Total</span><b>{t.total || "–"}</b>
              <span>Espai</span><b>{t.space || "–"}</b>
              <span>Porteres</span><b>{t.gks || "–"}</b>
            </div>
            <div className="ps-task-body">
              <div className="ps-text">
                {t.description && <p><b>Descripció</b>{t.description}</p>}
                {t.objective && <p><b>Objectiu</b>{t.objective}</p>}
                {t.rules && <p><b>Normes de provocació</b>{t.rules}</p>}
                {t.cues && <p><b>Consignes</b>{t.cues}</p>}
                {t.staff.some((r) => r.who || r.role) && (
                  <table className="ps-staff">
                    <tbody>
                      {t.staff.filter((r) => r.who || r.role || r.extra).map((r, j) => (
                        <tr key={j}><td>{r.who}</td><td>{r.role}</td><td>{r.extra}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="ps-draw">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.image ? <img src={t.image} alt="" /> : <DrillView d={t.diagram} />}
                {t.teams && <p><b>Equips</b>{t.teams}</p>}
                {t.scoring && <p><b>Puntuació</b>{t.scoring}</p>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
