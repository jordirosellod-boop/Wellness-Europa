"use client";

import { useEffect, useState } from "react";
import { monthName } from "@/components/league";
import { fetchAttendance, fetchSessionsBetween, monthBounds, pctClass, summarize, type Attendance } from "@/lib/attendance";
import { addMonths, fmtShort } from "@/lib/dates";
import { fmtSessionTime, todayMadrid, type Session } from "@/lib/wellness";

/** Assistència de la jugadora (només la seva), mes a mes. */
export function PlayerAttendance({ meId }: { meId: string }) {
  const today = todayMadrid();
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const [data, setData] = useState<{ sessions: Session[]; att: Attendance[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const { from, to } = monthBounds(month);
    fetchSessionsBetween(from, to < today ? to : today)
      .then(async (sessions) => ({ sessions, att: await fetchAttendance(sessions.map((s) => s.id), meId) }))
      .then(
        (d) => alive && setData(d),
        (e) => alive && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      alive = false;
    };
  }, [month, meId, today]);

  const sum = data ? summarize(data.sessions, data.att, meId) : null;
  const byId = new Map((data?.att ?? []).map((a) => [a.session_id, a.present]));
  const list = (data?.sessions ?? []).filter((s) => byId.has(s.id)).reverse();
  const isCurrent = month === today.slice(0, 7) + "-01";

  return (
    <>
      <h1>Assistència</h1>
      <p className="muted" style={{ marginTop: -6 }}>Només tu veus la teva assistència. La passa el staff a cada sessió.</p>

      <div className="row between card" style={{ padding: "8px 10px" }}>
        <button className="btn small secondary" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior">‹</button>
        <b>{monthName(month, true)}</b>
        <button className="btn small secondary" disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes següent">›</button>
      </div>

      {error && <p className="msg error">{error}</p>}
      {!data && !error && <p className="muted">Carregant…</p>}
      {sum && (
        <section className="card">
          <h2>Entrenaments</h2>
          <div className="stats three">
            <div className="stat">Presents<b>{sum.present}</b></div>
            <div className="stat">Absents<b>{sum.marked - sum.present}</b></div>
            <div className="stat">
              Assistència<b>{sum.pct == null ? "–" : `${sum.pct}%`}</b>
              {sum.pct != null && <span className={`chip ${pctClass(sum.pct)}`} style={{ alignSelf: "flex-start" }}>{sum.pct >= 90 ? "Molt bé" : sum.pct >= 75 ? "Correcte" : "Baixa"}</span>}
            </div>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>Cada entrenament amb «Present» compta per a la Lliga interna.</p>
        </section>
      )}
      {data && (
        <section className="card">
          <h2>Sessions</h2>
          {list.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Encara no s&apos;ha passat llista aquest mes.</p>
          ) : (
            <ul className="list">
              {list.map((s) => (
                <li key={s.id} className="row between">
                  <span>
                    <b>{fmtShort(s.session_date)}</b> · {s.name}
                    <span className="muted small"> · {s.kind}{s.start_time ? ` ${fmtSessionTime(s.start_time)}` : ""}</span>
                  </span>
                  {byId.get(s.id) ? <span className="chip band-bo">Present</span> : <span className="chip band-baix">Absent</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
