"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Calendar, StatusChip, type CalItem, type CalStatus } from "@/components/calendar";
import { CoachShell, Footer } from "@/components/ui";
import { viewRange, type CalView } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, fmtSessionTime, friendlyError, SESSION_COLS, todayMadrid, type Kind, type Session } from "@/lib/wellness";

export default function CoachSessionsPage() {
  return (
    <>
      <CoachShell>{() => <CoachCalendar />}</CoachShell>
      <Footer />
    </>
  );
}

type Counts = { w: number; r: number };

/** Estat per al staff: compara les respostes rebudes amb el nombre de jugadores. */
function coachStatus(s: Session, today: string, c: Counts, players: number): CalStatus {
  if (s.cancelled) return "cancellada";
  if (s.session_date > today) return "programada";
  if (players > 0 && c.w >= players && c.r >= players) return "completada";
  if (c.w > 0 || c.r > 0) return "parcial";
  return "pendent";
}

function CoachCalendar() {
  const today = todayMadrid();
  const [view, setView] = useState<CalView>("mes");
  const [anchor, setAnchor] = useState(today);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<{ sessions: Session[]; counts: Map<string, Counts>; players: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const { from, to } = viewRange(view, anchor);

  useEffect(() => {
    let alive = true;
    loadCoachRange(from, to).then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [from, to, version]);

  const items: CalItem[] = (data?.sessions ?? []).map((s) => ({
    session: s,
    status: coachStatus(s, today, data!.counts.get(s.id) ?? { w: 0, r: 0 }, data!.players),
  }));

  return (
    <>
      <div className="row between">
        <h1>Calendari</h1>
        <Link className="btn small secondary" href="/entrenador/programacio">⟳ Programacions</Link>
      </div>
      {error && <p className="msg error">{friendlyError(error)}</p>}
      <Calendar
        view={view}
        anchor={anchor}
        today={today}
        items={items}
        loading={data === null}
        onView={setView}
        onAnchor={(d) => {
          setAnchor(d);
          setAdding(null);
        }}
        renderItem={({ session: s, status }) => {
          const c = data?.counts.get(s.id) ?? { w: 0, r: 0 };
          return (
            <Link className="item" href={`/entrenador/sessio?id=${s.id}`}>
              <div className="row between">
                <b>{s.name}</b>
                <StatusChip status={status} />
              </div>
              <div className="muted small">
                {s.kind}
                {s.start_time ? ` · ${fmtSessionTime(s.start_time)}` : ""}
                {s.duration_min ? ` · ${s.duration_min} min` : ""}
                {s.rule_id ? " · ⟳ automàtica" : ""}
              </div>
              {s.session_date <= today && !s.cancelled && (
                <div className="small" style={{ marginTop: 2 }}>
                  Wellness {c.w}/{data?.players ?? 0} · RPE {c.r}/{data?.players ?? 0}
                </div>
              )}
            </Link>
          );
        }}
        dayFooter={(day) =>
          view === "setmana" ? null : adding === day ? (
            <NewSession
              date={day}
              onCreated={() => {
                setAdding(null);
                setVersion((v) => v + 1);
              }}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <button className="btn small secondary" style={{ marginTop: 10 }} onClick={() => setAdding(day)}>
              + Afegir sessió aquest dia
            </button>
          )
        }
      />
    </>
  );
}

async function loadCoachRange(from: string, to: string) {
  const sb = supabase();
  // Crea les sessions que toquin segons les programacions (no fa res si ja hi són).
  const gen = await sb.rpc("generate_rule_sessions");
  if (gen.error) throw new Error(gen.error.message);
  // Sempre filtrat per dates i paginat amb ordre fix (límit de 1.000 files de Supabase).
  const [sessions, playersRes] = await Promise.all([
    fetchAll<Session>((f, t) =>
      sb.from("sessions").select(SESSION_COLS).gte("session_date", from).lte("session_date", to)
        .order("session_date").order("start_time", { nullsFirst: true }).order("id").range(f, t),
    ),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "player"),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  const ids = sessions.map((s) => s.id);
  const counts = new Map<string, Counts>();
  if (ids.length) {
    const [w, r] = await Promise.all([
      fetchAll<{ session_id: string }>((f, t) => sb.from("wellness").select("session_id").in("session_id", ids).order("id").range(f, t)),
      fetchAll<{ session_id: string }>((f, t) => sb.from("rpe").select("session_id").in("session_id", ids).order("id").range(f, t)),
    ]);
    for (const x of w) counts.set(x.session_id, { w: (counts.get(x.session_id)?.w ?? 0) + 1, r: counts.get(x.session_id)?.r ?? 0 });
    for (const x of r) counts.set(x.session_id, { w: counts.get(x.session_id)?.w ?? 0, r: (counts.get(x.session_id)?.r ?? 0) + 1 });
  }
  return { sessions, counts, players: playersRes.count ?? 0 };
}

function NewSession({ date, onCreated, onCancel }: { date: string; onCreated: () => void; onCancel: () => void }) {
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<Kind>("Entrenament");
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("90");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMsg("Posa un nom a la sessió.");
    const mins = duration ? Number(duration) : null;
    if (mins != null && !(Number.isInteger(mins) && mins >= 1 && mins <= 300)) return setMsg("La durada ha de ser d'1 a 300 minuts.");
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase()
        .from("sessions")
        .insert({ session_date: date, start_time: time || null, kind, name: name.trim(), duration_min: mins })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("No s'ha confirmat la creació.");
      onCreated();
    } catch (err) {
      setMsg(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ marginTop: 12 }} onSubmit={create}>
      <h3>Nova sessió · {fmtDate(date)}</h3>
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
          placeholder={kind === "Partit" ? "Ex.: Partit vs. Sant Andreu" : "Ex.: Entrenament de força"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="stime">Hora (opcional)</label>
          <input id="stime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="sdur">Durada (min)</label>
          <input id="sdur" type="text" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </div>
      </div>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? "Creant…" : "Crear sessió"}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel·lar</button>
      </div>
      {msg && <p className="msg error" role="alert">{msg}</p>}
    </form>
  );
}
