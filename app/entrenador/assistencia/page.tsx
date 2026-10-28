"use client";

import { useEffect, useState } from "react";
import { CoachShell, Footer } from "@/components/ui";
import {
  ABSENCE_REASONS, ATT_COLS, fetchAttendance, fetchSessionsBetween, monthBounds, pctClass, reasonLabel, summarize,
  type AbsenceReason, type Attendance,
} from "@/lib/attendance";
import { addDays } from "@/lib/dates";
import { fetchNotices, type Notice } from "@/lib/absence";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, fmtSessionTime, todayMadrid, type Profile, type Session } from "@/lib/wellness";
import { monthName } from "@/components/league";
import { Loading } from "@/components/loading";

export default function AttendancePage() {
  return (
    <>
      <CoachShell>{() => <Roll />}</CoachShell>
      <Footer />
    </>
  );
}

type Data = { players: Profile[]; sessions: Session[]; att: Attendance[]; notices: Notice[]; well: { session_id: string; player_id: string }[] };

async function fetchData(day: string): Promise<Data> {
  const sb = supabase();
  const { from, to } = monthBounds(day);
  const [players, sessions] = await Promise.all([
    fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").eq("role", "player").order("display_name").order("id").range(f, t)),
    fetchSessionsBetween(from, to),
  ]);
  const ids = sessions.map((s) => s.id);
  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
  const [att, notices, well] = await Promise.all([
    fetchAttendance(ids),
    fetchNotices(ids).catch(() => []),
    // Qui ha fet el wellness (per proposar-la com a present)
    Promise.all(chunks.map((c) => fetchAll<{ session_id: string; player_id: string }>((f, t) =>
      sb.from("wellness").select("session_id, player_id").in("session_id", c).order("session_id").order("player_id").range(f, t)))).then((x) => x.flat()),
  ]);
  return { players, sessions, att, notices, well };
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
  const rowsOf = (data?.att ?? []).filter((a) => a.session_id === selected);
  const status = new Map(rowsOf.map((a) => [a.player_id, a.present]));
  const reasons = new Map(rowsOf.map((a) => [a.player_id, a.reason]));
  const [askReason, setAskReason] = useState<string | null>(null); // jugadora a qui es tria el motiu

  /** Desa i, només quan el servidor ho confirma, actualitza la pantalla. */
  async function mark(playerIds: string[], present: boolean, reason: AbsenceReason | null = null) {
    if (!session || playerIds.length === 0) return;
    setMsg(null);
    setSaving((s) => new Set([...s, ...playerIds]));
    const { data: rows, error: e } = await supabase()
      .from("attendance")
      .upsert(playerIds.map((pid) => ({ session_id: session.id, player_id: pid, present, reason: present ? null : reason })), { onConflict: "session_id,player_id" })
      .select(ATT_COLS);
    setSaving((s) => new Set([...s].filter((x) => !playerIds.includes(x))));
    if (e || !rows || rows.length !== playerIds.length) {
      setMsg({ ok: false, text: `No s'ha pogut desar. ${e?.message ?? "Torna-ho a provar."}` });
      return false;
    }
    setData((d) => d && {
      ...d,
      att: [...d.att.filter((a) => !(a.session_id === session.id && playerIds.includes(a.player_id))), ...(rows as Attendance[])],
    });
    if (playerIds.length > 1) setMsg({ ok: true, text: `Desat: ${playerIds.length} jugadores marcades com a presents.` });
    return true;
  }

  const players = data?.players ?? [];
  const present = players.filter((p) => status.get(p.id) === true).length;
  const absent = players.filter((p) => status.get(p.id) === false).length;
  const unmarked = players.filter((p) => !status.has(p.id));
  // Proposta: qui ha avisat que no vindrà → absent (amb el seu motiu); qui ha fet el wellness → present.
  const noticeOf = new Map((data?.notices ?? []).filter((n) => n.session_id === selected).map((n) => [n.player_id, n]));
  const wellDone = new Set((data?.well ?? []).filter((w) => w.session_id === selected).map((w) => w.player_id));
  const proposeAbsent = unmarked.filter((p) => noticeOf.has(p.id));
  const proposePresent = unmarked.filter((p) => !noticeOf.has(p.id) && wellDone.has(p.id));
  const notNoticed = unmarked.filter((p) => !noticeOf.has(p.id));

  async function confirmProposal() {
    if (proposePresent.length && !(await mark(proposePresent.map((p) => p.id), true))) return;
    const byReason = new Map<AbsenceReason, string[]>();
    for (const p of proposeAbsent) {
      const r = noticeOf.get(p.id)!.reason;
      byReason.set(r, [...(byReason.get(r) ?? []), p.id]);
    }
    for (const [r, ids] of byReason) if (!(await mark(ids, false, r))) return;
    setMsg({ ok: true, text: `Desat: ${proposePresent.length} presents i ${proposeAbsent.length} absents. Revisa la resta.` });
  }

  return (
    <>
      <h1>Assistència</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Passa llista a cada sessió. Cada «Present» a un entrenament suma 1 entrenament a la Lliga interna del mes. «Absent» treu la
        multa automàtica de l&apos;RPE d&apos;aquell entrenament (la del wellness es manté).
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
      {!data && !error && <Loading />}

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
          {(proposePresent.length > 0 || proposeAbsent.length > 0) && (
            <div className="roll-proposal">
              <span>
                <b>Proposta:</b> {proposePresent.length} {proposePresent.length === 1 ? "present" : "presents"} (han fet el wellness)
                {proposeAbsent.length > 0 && <> i {proposeAbsent.length} {proposeAbsent.length === 1 ? "absent" : "absents"} (han avisat)</>}.
              </span>
              <button className="btn block" disabled={saving.size > 0} onClick={confirmProposal}>Confirmar la proposta</button>
            </div>
          )}
          {notNoticed.length > 0 && (
            <button className={`btn block${proposePresent.length || proposeAbsent.length ? " secondary" : ""}`} disabled={saving.size > 0} onClick={() => mark(notNoticed.map((p) => p.id), true)}>
              Marcar les {notNoticed.length} que falten com a presents{proposeAbsent.length ? " (menys les que han avisat)" : ""}
            </button>
          )}
          {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
          {players.length === 0 && <p className="muted">Encara no hi ha jugadores.</p>}
          <ul className="list roll">
            {players.map((p) => {
              const v = status.get(p.id);
              const busy = saving.has(p.id);
              const why = reasons.get(p.id) ?? null;
              const asking = v === false && askReason === p.id;
              return (
                <li key={p.id} className="roll-item">
                  <div className="row between">
                  <span className="pname">
                    {p.display_name}{busy && <span className="muted small"> · desant…</span>}
                    {noticeOf.has(p.id) && <span className="roll-hint away" title={noticeOf.get(p.id)!.note ?? undefined}>🙋‍♀️ Ha avisat · {reasonLabel(noticeOf.get(p.id)!.reason)}</span>}
                    {v === undefined && !noticeOf.has(p.id) && wellDone.has(p.id) && <span className="roll-hint ok">Wellness fet</span>}
                    {v === false && !asking && (
                      <button type="button" className={`reason-tag${why ? "" : " empty"}`} onClick={() => setAskReason(p.id)} title="Motiu de l'absència">
                        {why ? `${reasonLabel(why)} ✎` : "+ Motiu"}
                      </button>
                    )}
                  </span>
                  <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <button className={`roll-btn yes${v === true ? " on" : ""}`} aria-pressed={v === true} disabled={busy} onClick={() => v !== true && mark([p.id], true)}>
                      Present
                    </button>
                    <button className={`roll-btn no${v === false ? " on" : ""}`} aria-pressed={v === false} disabled={busy}
                      onClick={() => (v !== false ? mark([p.id], false).then((ok) => ok && setAskReason(p.id)) : setAskReason(p.id))}>
                      Absent
                    </button>
                  </span>
                  </div>
                  {asking && (
                    <div className="reason-pick" role="group" aria-label={`Motiu de l'absència de ${p.display_name}`}>
                      <span className="muted small">Motiu:</span>
                      {ABSENCE_REASONS.map(([k, label]) => (
                        <button key={k} type="button" aria-pressed={why === k} disabled={busy}
                          onClick={() => mark([p.id], false, k).then((ok) => ok && setAskReason(null))}>
                          {label}
                        </button>
                      ))}
                      <button type="button" className="linkbtn" onClick={() => setAskReason(null)}>{why ? "Fet" : "Ara no"}</button>
                    </div>
                  )}
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
  const trainingIds = new Set(trainings.map((s) => s.id));
  /** Motius de les absències del mes als entrenaments, p. ex. «Estudis ×2 · Malaltia». */
  const whyOf = (pid: string) => {
    const n = new Map<string, number>();
    for (const a of data.att) if (a.player_id === pid && !a.present && trainingIds.has(a.session_id)) {
      const k = reasonLabel(a.reason) ?? "Motiu no indicat";
      n.set(k, (n.get(k) ?? 0) + 1);
    }
    return [...n].map(([k, c]) => (c > 1 ? `${k} ×${c}` : k)).join(" · ");
  };
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
                <td>
                  <span className="pname">{r.p.display_name}</span>
                  {whyOf(r.p.id) && <span className="muted small reason-sum">{whyOf(r.p.id)}</span>}
                </td>
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
