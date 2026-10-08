"use client";

import { useEffect, useState } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { fetchAttendance, fetchSessionsBetween, monthBounds, pctClass, summarize, type Attendance } from "@/lib/attendance";
import { addDays } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, fmtSessionTime, todayMadrid, type Profile, type Session } from "@/lib/wellness";
import { monthName } from "@/components/league";

export default function AttendancePage() {
  return (
    <>
      <CoachShell>{() => <Roll />}</CoachShell>
      <Footer />
    </>
  );
}

type Data = { players: Profile[]; sessions: Session[]; att: Attendance[] };

async function fetchData(day: string): Promise<Data> {
  const sb = supabase();
  const { from, to } = monthBounds(day);
  const [players, sessions] = await Promise.all([
    fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").eq("role", "player").order("display_name").order("id").range(f, t)),
    fetchSessionsBetween(from, to),
  ]);
  const att = await fetchAttendance(sessions.map((s) => s.id));
  return { players, sessions, att };
}

function Roll() {
  const today = todayMadrid();
  const [day, setDay] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchData(day).then(
      (d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        const ofDay = d.sessions.filter((s) => s.session_date === day);
        setSelected((cur) => (ofDay.some((s) => s.id === cur) ? cur : (ofDay.find((s) => s.kind === "Entrenament") ?? ofDay[0])?.id ?? null));
      },
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [day]);

  const daySessions = data?.sessions.filter((s) => s.session_date === day) ?? [];
  const session = daySessions.find((s) => s.id === selected) ?? null;
  const status = new Map((data?.att ?? []).filter((a) => a.session_id === selected).map((a) => [a.player_id, a.present]));

  /** Desa i, només quan el servidor ho confirma, actualitza la pantalla. */
  async function mark(playerIds: string[], present: boolean) {
    if (!session || playerIds.length === 0) return;
    setMsg(null);
    setSaving((s) => new Set([...s, ...playerIds]));
    const { data: rows, error: e } = await supabase()
      .from("attendance")
      .upsert(playerIds.map((pid) => ({ session_id: session.id, player_id: pid, present })), { onConflict: "session_id,player_id" })
      .select("session_id, player_id, present");
    setSaving((s) => new Set([...s].filter((x) => !playerIds.includes(x))));
    if (e || !rows || rows.length !== playerIds.length) {
      setMsg({ ok: false, text: `No s'ha pogut desar. ${e?.message ?? "Torna-ho a provar."}` });
      return;
    }
    setData((d) => d && {
      ...d,
      att: [...d.att.filter((a) => !(a.session_id === session.id && playerIds.includes(a.player_id))), ...(rows as Attendance[])],
    });
    if (playerIds.length > 1) setMsg({ ok: true, text: `Desat: ${playerIds.length} jugadores marcades com a presents.` });
  }

  const players = data?.players ?? [];
  const present = players.filter((p) => status.get(p.id) === true).length;
  const absent = players.filter((p) => status.get(p.id) === false).length;
  const unmarked = players.filter((p) => !status.has(p.id));

  return (
    <>
      <h1>Assistència</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Passa llista a cada sessió. Cada «Present» a un entrenament suma 1 entrenament a la Lliga interna del mes.
      </p>

      <div className="row between card" style={{ padding: "8px 10px" }}>
        <button className="btn small secondary" onClick={() => setDay(addDays(day, -1))} aria-label="Dia anterior">‹</button>
        <b className="center" style={{ flex: 1 }}>{day === today ? "Avui · " : ""}{fmtDate(day)}</b>
        <button className="btn small secondary" onClick={() => setDay(addDays(day, 1))} aria-label="Dia següent">›</button>
      </div>
      {day !== today && (
        <p className="center" style={{ marginTop: -4 }}>
          <button className="btn small secondary" onClick={() => setDay(today)}>Tornar a avui</button>
        </p>
      )}

      {error && <p className="msg error">{error}</p>}
      {!data && !error && <p className="muted">Carregant…</p>}

      {data && daySessions.length === 0 && <p className="card">Aquest dia no hi ha cap sessió.</p>}

      {data && daySessions.length > 1 && (
        <div className="tabs" style={{ marginBottom: 12 }}>
          {daySessions.map((s) => (
            <button key={s.id} aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>
              {fmtSessionTime(s.start_time) && `${fmtSessionTime(s.start_time)} · `}{s.name}
            </button>
          ))}
        </div>
      )}

      {data && session && (
        <section className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>{session.name}</h2>
            <span className="chip">{session.kind}{session.start_time ? ` · ${fmtSessionTime(session.start_time)}` : ""}</span>
          </div>
          <p className="muted small" style={{ margin: "8px 0" }}>
            Presents <b>{present}</b> · Absents <b>{absent}</b> · Sense marcar <b>{unmarked.length}</b>
            {session.kind !== "Entrenament" && " · (no és entrenament: no compta per a la lliga)"}
          </p>
          {unmarked.length > 0 && (
            <button className="btn block" disabled={saving.size > 0} onClick={() => mark(unmarked.map((p) => p.id), true)}>
              Marcar les {unmarked.length} que falten com a presents
            </button>
          )}
          {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
          {players.length === 0 && <p className="muted">Encara no hi ha jugadores.</p>}
          <ul className="list roll">
            {players.map((p) => {
              const v = status.get(p.id);
              const busy = saving.has(p.id);
              return (
                <li key={p.id} className="row between">
                  <span className="pname">{p.display_name}{busy && <span className="muted small"> · desant…</span>}</span>
                  <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <button className={`roll-btn yes${v === true ? " on" : ""}`} aria-pressed={v === true} disabled={busy} onClick={() => v !== true && mark([p.id], true)}>
                      Present
                    </button>
                    <button className={`roll-btn no${v === false ? " on" : ""}`} aria-pressed={v === false} disabled={busy} onClick={() => v !== false && mark([p.id], false)}>
                      Absent
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data && <MonthSummary day={day} data={data} />}
    </>
  );
}

function MonthSummary({ day, data }: { day: string; data: Data }) {
  const trainings = data.sessions.filter((s) => s.kind === "Entrenament");
  const markedSessions = new Set(data.att.map((a) => a.session_id));
  const done = trainings.filter((s) => markedSessions.has(s.id)).length;
  const rows = data.players
    .map((p) => ({ p, ...summarize(data.sessions, data.att, p.id) }))
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.present - a.present || a.p.display_name.localeCompare(b.p.display_name, "ca"));
  return (
    <section className="card">
      <h2>Entrenaments {/^[aeiouàèéíòóú]/i.test(monthName(day)) ? "d'" : "de "}{monthName(day).toLowerCase()}</h2>
      <p className="muted small" style={{ marginTop: -4 }}>S&apos;ha passat llista a {done} de {trainings.length} entrenaments del mes.</p>
      <div className="table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Jugadora</th>
              <th title="Entrenaments presents">Pres.</th>
              <th title="Entrenaments on s'ha passat llista">De</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.id}>
                <td><span className="pname">{r.p.display_name}</span></td>
                <td><b>{r.present}</b></td>
                <td>{r.marked}</td>
                <td>{r.pct == null ? "–" : <span className={`chip ${pctClass(r.pct)}`}>{r.pct}%</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
