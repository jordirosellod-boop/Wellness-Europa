"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, StatusChip, type CalItem, type CalStatus } from "@/components/calendar";
import { RpeForm, WellnessForm } from "@/components/forms";
import { Brand, Footer } from "@/components/ui";
import { viewRange, type CalView } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import {
  bandOf,
  fmtDate,
  fmtSessionTime,
  fmtTime,
  SESSION_COLS,
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
  const [version, setVersion] = useState(0);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      // Crea les sessions que toquin segons les programacions (si encara no existeixen).
      await sb.rpc("generate_rule_sessions");
      const { data, error } = await sb
        .from("sessions")
        .select(SESSION_COLS)
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

  function openToday(id: string) {
    setSelected(id);
    top.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <div ref={top} />
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
      {session && <SessionForms key={session.id} me={me} session={session} onSaved={() => setVersion((v) => v + 1)} />}
      {sessions !== null && <PlayerCalendar me={me} today={today} version={version} onOpenToday={openToday} />}
    </>
  );
}

function SessionForms({ me, session, onSaved }: { me: Profile; session: Session; onSaved: () => void }) {
  const editable = true;
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
        <WellnessForm sessionId={session.id} existing={w} editable={editable} onSaved={(x) => { setW(x); onSaved(); }} />
      </section>
      <section className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>RPE <span className="muted small">(després)</span></h2>
          {r ? <span className="chip fet">Enviat {fmtTime(r.submitted_at)}</span> : <span className="chip pendent">Pendent</span>}
        </div>
        <RpeForm sessionId={session.id} plannedDuration={session.duration_min} existing={r} editable={editable} onSaved={(x) => { setR(x); onSaved(); }} />
      </section>
      <p className="muted small center">Pots modificar les respostes fins a les 23:59 d&apos;avui.</p>
    </>
  );
}

type Mine = { w?: Pick<Wellness, "score">; r?: Pick<Rpe, "rpe" | "duration_min" | "load"> };

function playerStatus(s: Session, today: string, m: Mine): CalStatus {
  if (m.w && m.r) return "completada";
  if (m.w || m.r) return "parcial";
  return s.session_date > today ? "programada" : "pendent";
}

/** Calendari de la jugadora: les sessions i com les ha omplert ella (només veu les seves dades). */
function PlayerCalendar({ me, today, version, onOpenToday }: { me: Profile; today: string; version: number; onOpenToday: (id: string) => void }) {
  const [view, setView] = useState<CalView>("mes");
  const [anchor, setAnchor] = useState(today);
  const [data, setData] = useState<{ sessions: Session[]; mine: Map<string, Mine> }>({ sessions: [], mine: new Map() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { from, to } = viewRange(view, anchor);

  useEffect(() => {
    let alive = true;
    loadPlayerRange(me.id, from, to).then(
      (d) => {
        if (!alive) return;
        setData(d);
        setLoading(false);
      },
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [me.id, from, to, version]);

  const items: CalItem[] = data.sessions.map((s) => ({ session: s, status: playerStatus(s, today, data.mine.get(s.id) ?? {}) }));

  return (
    <>
      <h2 style={{ marginTop: 20 }}>El meu calendari</h2>
      {error && <p className="msg error">{error}</p>}
      <Calendar
        view={view}
        anchor={anchor}
        today={today}
        items={items}
        loading={loading}
        onView={setView}
        onAnchor={setAnchor}
        renderItem={({ session: s, status }) => {
          const m = data.mine.get(s.id) ?? {};
          return (
            <div>
              <div className="row between">
                <b>{s.name}</b>
                <StatusChip status={status} />
              </div>
              <div className="muted small">
                {s.kind}
                {s.start_time ? ` · ${fmtSessionTime(s.start_time)}` : ""}
                {s.duration_min ? ` · ${s.duration_min} min` : ""}
              </div>
              {(m.w || m.r) && (
                <div className="row" style={{ marginTop: 6 }}>
                  {m.w && <span className={`chip ${bandOf(Number(m.w.score)).cls}`}>Wellness {Number(m.w.score).toFixed(1)}</span>}
                  {m.r && <span className="chip">RPE {m.r.rpe}</span>}
                  {m.r?.load != null && <span className="chip">Càrrega {m.r.load}</span>}
                </div>
              )}
              {s.session_date === today && (
                <button className="btn small" style={{ marginTop: 8 }} onClick={() => onOpenToday(s.id)}>
                  {status === "completada" ? "Veure o editar" : "Omplir ara"}
                </button>
              )}
            </div>
          );
        }}
      />
    </>
  );
}

async function loadPlayerRange(playerId: string, from: string, to: string) {
  const sb = supabase();
  // Sempre filtrat per dates i paginat amb ordre fix (límit de 1.000 files de Supabase).
  const sessions = await fetchAll<Session>((f, t) =>
    sb.from("sessions").select(SESSION_COLS).gte("session_date", from).lte("session_date", to)
      .order("session_date").order("start_time", { nullsFirst: true }).order("id").range(f, t),
  );
  const ids = sessions.map((s) => s.id);
  const mine = new Map<string, Mine>();
  if (ids.length) {
    const [w, r] = await Promise.all([
      fetchAll<{ session_id: string; score: number }>((f, t) =>
        sb.from("wellness").select("session_id, score").eq("player_id", playerId).in("session_id", ids).order("id").range(f, t),
      ),
      fetchAll<{ session_id: string; rpe: number; duration_min: number | null; load: number | null }>((f, t) =>
        sb.from("rpe").select("session_id, rpe, duration_min, load").eq("player_id", playerId).in("session_id", ids).order("id").range(f, t),
      ),
    ]);
    for (const x of w) mine.set(x.session_id, { ...mine.get(x.session_id), w: x });
    for (const x of r) mine.set(x.session_id, { ...mine.get(x.session_id), r: x });
  }
  return { sessions, mine };
}
