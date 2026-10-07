"use client";

import { useCallback, useEffect, useState } from "react";
import { RpeForm, WellnessForm } from "@/components/forms";
import { Brand, Footer } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  bandOf,
  fmtDate,
  fmtSessionTime,
  fmtTime,
  todayMadrid,
  type Profile,
  type Rpe,
  type Session,
  type Wellness,
} from "@/lib/wellness";

type State =
  | { kind: "loading" }
  | { kind: "nolink" }
  | { kind: "badlink" }
  | { kind: "error"; text: string }
  | { kind: "ready"; me: Profile };

function decodeKey(key: string): { email: string; password: string } | null {
  try {
    const b64 = key.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const [email, password] = text.split(" ");
    return email && password ? { email, password } : null;
  } catch {
    return null;
  }
}

export default function PlayerPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const sb = supabase();
        // L'enllaç personal porta la clau després del "#" (no s'envia mai al servidor web).
        const key = window.location.hash.slice(1);
        const { data } = await sb.auth.getSession();
        let user = data.session?.user ?? null;
        if (key) {
          const creds = decodeKey(key);
          if (!creds) return setState({ kind: "badlink" });
          if (user?.email !== creds.email) {
            if (user) await sb.auth.signOut({ scope: "local" });
            const { data: s, error } = await sb.auth.signInWithPassword(creds);
            if (error || !s.user) {
              const offline = error && /fetch|network/i.test(error.message);
              return setState(offline ? { kind: "error", text: "Sense connexió. Torna-ho a provar." } : { kind: "badlink" });
            }
            user = s.user;
          }
        }
        if (!user) return setState({ kind: "nolink" });
        const { data: me, error } = await sb.from("profiles").select("id, role, display_name").eq("id", user.id).maybeSingle();
        if (error) throw error;
        if (!me || me.role !== "player") return setState({ kind: "nolink" });
        setState({ kind: "ready", me: me as Profile });
      } catch (e) {
        setState({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, []);

  return (
    <>
      <header className="topbar">
        <Brand />
        {state.kind === "ready" && <span className="small">{state.me.display_name}</span>}
      </header>
      <main>
        {state.kind === "loading" && <p className="muted">Carregant…</p>}
        {state.kind === "nolink" && (
          <div className="card">
            <h1 style={{ marginTop: 0 }}>Obre el teu enllaç</h1>
            <p>Per entrar, obre l&apos;enllaç personal que t&apos;ha enviat el teu entrenador.</p>
          </div>
        )}
        {state.kind === "badlink" && (
          <div className="card">
            <h1 style={{ marginTop: 0 }}>Aquest enllaç ja no funciona</h1>
            <p>Demana al teu entrenador que t&apos;enviï l&apos;enllaç nou.</p>
          </div>
        )}
        {state.kind === "error" && <p className="msg error">{state.text}</p>}
        {state.kind === "ready" && <PlayerHome me={state.me} />}
      </main>
      <Footer />
    </>
  );
}

function PlayerHome({ me }: { me: Profile }) {
  const today = todayMadrid();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase()
        .from("sessions")
        .select("id, session_date, start_time, kind, name")
        .eq("session_date", today)
        .order("start_time", { ascending: true, nullsFirst: true })
        .order("id")
        .range(0, 49);
      if (error) return setError(error.message);
      setSessions(data as Session[]);
      if (data.length > 0) setSelected(data[0].id);
    })();
  }, [today]);

  const session = sessions?.find((s) => s.id === selected) ?? null;

  return (
    <>
      <h1>Hola, {me.display_name}!</h1>
      <p className="muted" style={{ marginTop: -6 }}>{fmtDate(today)}</p>
      {error && <p className="msg error">{error}</p>}
      {sessions === null && !error && <p className="muted">Carregant…</p>}
      {sessions?.length === 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>Avui no hi ha cap sessió programada.</p>
        </div>
      )}
      {sessions && sessions.length > 1 && (
        <div className="tabs" style={{ marginBottom: 12 }}>
          {sessions.map((s) => (
            <button key={s.id} aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>
              {fmtSessionTime(s.start_time) && `${fmtSessionTime(s.start_time)} · `}
              {s.name}
            </button>
          ))}
        </div>
      )}
      {session && <SessionForms key={session.id} me={me} session={session} editable />}
      <History me={me} today={today} />
    </>
  );
}

function SessionForms({ me, session, editable }: { me: Profile; session: Session; editable: boolean }) {
  const [w, setW] = useState<Wellness | null | undefined>(undefined);
  const [r, setR] = useState<Rpe | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [wr, rr] = await Promise.all([
        sb.from("wellness").select("*").eq("session_id", session.id).eq("player_id", me.id).maybeSingle(),
        sb.from("rpe").select("*").eq("session_id", session.id).eq("player_id", me.id).maybeSingle(),
      ]);
      if (wr.error || rr.error) return setError((wr.error ?? rr.error)!.message);
      setW(wr.data as Wellness | null);
      setR(rr.data as Rpe | null);
    })();
  }, [session.id, me.id]);

  if (error) return <p className="msg error">{error}</p>;
  if (w === undefined || r === undefined) return <p className="muted">Carregant…</p>;

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>
            {session.kind === "Partit" ? "⚽ " : ""}
            {session.name}
          </h2>
          <span className="chip">{session.kind}{session.start_time ? ` · ${fmtSessionTime(session.start_time)}` : ""}</span>
        </div>
      </div>
      <section className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Wellness <span className="muted small">(abans)</span></h2>
          {w ? <span className="chip fet">Enviat {fmtTime(w.submitted_at)}</span> : <span className="chip pendent">Pendent</span>}
        </div>
        <WellnessForm sessionId={session.id} existing={w} editable={editable} onSaved={setW} />
      </section>
      <section className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>RPE <span className="muted small">(després)</span></h2>
          {r ? <span className="chip fet">Enviat {fmtTime(r.submitted_at)}</span> : <span className="chip pendent">Pendent</span>}
        </div>
        <RpeForm sessionId={session.id} existing={r} editable={editable} onSaved={setR} />
      </section>
      <p className="muted small center">Pots modificar les respostes fins a les 23:59 d&apos;avui.</p>
    </>
  );
}

type HistRow = Session & {
  wellness: Pick<Wellness, "score" | "submitted_at">[];
  rpe: Pick<Rpe, "rpe" | "submitted_at">[];
};

const PAGE = 10;

// Sessions anteriors amb els registres propis (la base de dades només deixa veure els seus).
function fetchHistory(playerId: string, today: string, from: number) {
  return supabase()
    .from("sessions")
    .select("id, session_date, start_time, kind, name, wellness(score, submitted_at), rpe(rpe, submitted_at)")
    .lt("session_date", today)
    .eq("wellness.player_id", playerId)
    .eq("rpe.player_id", playerId)
    .order("session_date", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE - 1);
}

function History({ me, today }: { me: Profile; today: string }) {
  const [rows, setRows] = useState<HistRow[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((from: number, res: Awaited<ReturnType<typeof fetchHistory>>) => {
    setBusy(false);
    if (res.error) return setError(res.error.message);
    const data = (res.data ?? []) as unknown as HistRow[];
    setRows((prev) => (from === 0 ? data : [...prev, ...data]));
    setMore(data.length === PAGE);
  }, []);

  useEffect(() => {
    fetchHistory(me.id, today, 0).then((res) => apply(0, res));
  }, [apply, me.id, today]);

  function loadMore() {
    const from = rows.length;
    setBusy(true);
    fetchHistory(me.id, today, from).then((res) => apply(from, res));
  }

  return (
    <section className="card">
      <h2>Els meus registres</h2>
      {error && <p className="msg error">{error}</p>}
      {rows.length === 0 && !busy && !error && <p className="muted" style={{ margin: 0 }}>Encara no hi ha sessions anteriors.</p>}
      <ul className="list">
        {rows.map((s) => {
          const w = s.wellness[0];
          const r = s.rpe[0];
          return (
            <li key={s.id}>
              <div className="row between">
                <b>{s.name}</b>
                <span className="muted small">{fmtDate(s.session_date)}</span>
              </div>
              <div className="row" style={{ marginTop: 4 }}>
                {w ? (
                  <span className={`chip ${bandOf(Number(w.score)).cls}`}>Wellness {Number(w.score).toFixed(1)}</span>
                ) : (
                  <span className="chip pendent">Sense wellness</span>
                )}
                {r ? <span className="chip">RPE {r.rpe}</span> : <span className="chip pendent">Sense RPE</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {more && rows.length > 0 && (
        <button className="btn secondary block" style={{ marginTop: 12 }} disabled={busy} onClick={loadMore}>
          {busy ? "Carregant…" : "Veure'n més"}
        </button>
      )}
    </section>
  );
}
