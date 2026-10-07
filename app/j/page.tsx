"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Calendar, StatusChip, type CalItem, type CalStatus } from "@/components/calendar";
import { RpeForm, WellnessForm } from "@/components/forms";
import { FcfStats } from "@/components/fcf-stats";
import { PlayerFines } from "@/components/player-fines";
import { detect as detectReminders, Reminders, type Status as ReminderStatus } from "@/components/reminders";
import { fmtEuros } from "@/lib/fines";
import { Brand, Footer } from "@/components/ui";
import { fmtShort, viewRange, type CalView } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import {
  bandOf,
  fmtDate,
  fmtSessionTime,
  fmtTime,
  SESSION_COLS,
  todayMadrid,
  WELLNESS_DEADLINE,
  wellnessClosed,
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
        {state.kind === "nolink" && <PasteLink />}
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

/** Si l'app s'obre sense l'enllaç (per exemple, des de la icona de l'iPhone), es pot enganxar aquí. */
function PasteLink() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  function go() {
    const key = text.trim().split("#")[1]?.trim();
    if (!key || !decodeKey(key)) return setError("Això no sembla el teu enllaç. Copia'l sencer del missatge de l'entrenador.");
    window.location.hash = key;
    window.location.reload();
  }
  return (
    <div className="card stack">
      <h1 style={{ marginTop: 0 }}>Obre el teu enllaç</h1>
      <p style={{ margin: 0 }}>Obre l&apos;enllaç personal que t&apos;ha enviat el teu entrenador, o enganxa&apos;l aquí (només cal la primera vegada):</p>
      <input type="text" inputMode="url" autoComplete="off" placeholder="https://wellness-europa.vercel.app/j#…" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn block" onClick={go} disabled={!text.trim()}>Entrar</button>
      {error && <p className="msg error">{error}</p>}
    </div>
  );
}

type Section = "inici" | "avui" | "calendari" | "multes" | "normes" | "avisos" | "stats";
const SECTIONS: Section[] = ["inici", "avui", "calendari", "multes", "normes", "avisos", "stats"];

function sectionFromUrl(): Section {
  const s = new URLSearchParams(window.location.search).get("s") as Section | null;
  return s && SECTIONS.includes(s) ? s : "inici";
}

/**
 * Pantalla de la jugadora, separada en apartats amb un menú a baix.
 * L'apartat va a l'adreça (?s=...) perquè funcioni el botó "enrere", i es conserva
 * el "#" de l'enllaç personal.
 */
function PlayerHome({ me }: { me: Profile }) {
  const today = todayMadrid();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [section, setSection] = useState<Section>("inici");

  useEffect(() => {
    const sync = () => setSection(sectionFromUrl());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

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

  function go(next: Section) {
    if (next !== section) {
      const url = `${window.location.pathname}${next === "inici" ? "" : `?s=${next}`}${window.location.hash}`;
      window.history.pushState(null, "", url);
      setSection(next);
    }
    window.scrollTo({ top: 0 });
  }

  function openSession(id: string) {
    setSelected(id);
    go("avui");
  }

  const session = sessions?.find((s) => s.id === selected) ?? null;
  const saved = () => setVersion((v) => v + 1);

  return (
    <div className="player-app">
      {error && <p className="msg error">{error}</p>}
      {sessions === null && !error && <p className="muted">Carregant…</p>}

      {sessions !== null && section === "inici" && (
        <Dashboard me={me} today={today} sessions={sessions} version={version} go={go} onOpenSession={openSession} />
      )}

      {sessions !== null && section === "avui" && (
        <>
          <h1>Avui</h1>
          <p className="muted" style={{ marginTop: -6 }}>{fmtDate(today)}</p>
          {sessions.length === 0 && (
            <div className="card">
              <p style={{ margin: 0 }}>Avui no hi ha cap sessió programada.</p>
            </div>
          )}
          {sessions.length > 1 && (
            <div className="tabs" style={{ marginBottom: 12 }}>
              {sessions.map((s) => (
                <button key={s.id} aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>
                  {fmtSessionTime(s.start_time) && `${fmtSessionTime(s.start_time)} · `}
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {session && <SessionForms key={session.id} me={me} session={session} onSaved={saved} />}
        </>
      )}

      {sessions !== null && section === "calendari" && (
        <PlayerCalendar me={me} today={today} version={version} onOpenToday={openSession} />
      )}

      {sessions !== null && section === "multes" && <PlayerFines playerId={me.id} />}
      {sessions !== null && section === "normes" && <PlayerFines playerId={me.id} rulesOpen />}
      {sessions !== null && section === "stats" && <FcfStats mode="player" meId={me.id} />}

      {sessions !== null && section === "avisos" && (
        <>
          <h1>Avisos</h1>
          <Reminders />
        </>
      )}

      <nav className="bottom-nav" aria-label="Menú">
        {([
          ["inici", "Inici", ICONS.inici],
          ["avui", "Avui", ICONS.avui],
          ["calendari", "Calendari", ICONS.calendari],
          ["multes", "Multes", ICONS.multes],
        ] as [Section, string, ReactNode][]).map(([key, label, icon]) => (
          <button key={key} type="button" aria-current={section === key || (key === "multes" && section === "normes") ? "page" : undefined} onClick={() => go(key)}>
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS: Record<"inici" | "avui" | "calendari" | "multes", ReactNode> = {
  inici: svg("M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"),
  avui: svg("M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"),
  calendari: svg("M7 3v4M17 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"),
  multes: svg("M18.5 6.5A7 7 0 1 0 18.5 17.5M4 10.5h10M4 13.5h10"),
};

type DashData = {
  mine: Map<string, { w: boolean; r: boolean }>;
  pending: number;
  next: Session | null;
  reminders: ReminderStatus;
};

async function loadDashboard(playerId: string, today: string, sessions: Session[]): Promise<DashData> {
  const sb = supabase();
  const ids = sessions.map((s) => s.id);
  const [w, r, fines, next, reminders] = await Promise.all([
    ids.length ? sb.from("wellness").select("session_id").eq("player_id", playerId).in("session_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? sb.from("rpe").select("session_id").eq("player_id", playerId).in("session_id", ids) : Promise.resolve({ data: [], error: null }),
    fetchAll<{ amount_cents: number; paid: boolean }>((f, t) =>
      sb.from("fines").select("amount_cents, paid").eq("person_id", playerId).order("id").range(f, t),
    ),
    sb.from("sessions").select(SESSION_COLS).gt("session_date", today)
      .order("session_date").order("start_time", { nullsFirst: true }).order("id").range(0, 0),
    detectReminders().catch((): ReminderStatus => "unsupported"),
  ]);
  for (const res of [w, r, next]) if (res.error) throw new Error(res.error.message);
  const mine = new Map<string, { w: boolean; r: boolean }>();
  for (const id of ids) mine.set(id, { w: false, r: false });
  for (const x of (w.data ?? []) as { session_id: string }[]) mine.get(x.session_id)!.w = true;
  for (const x of (r.data ?? []) as { session_id: string }[]) mine.get(x.session_id)!.r = true;
  return {
    mine,
    pending: fines.filter((f) => !f.paid).reduce((a, f) => a + f.amount_cents, 0),
    next: ((next.data ?? []) as Session[])[0] ?? null,
    reminders,
  };
}

/** Inici: resum d'avui i accessos a cada apartat. */
function Dashboard({
  me, today, sessions, version, go, onOpenSession,
}: {
  me: Profile;
  today: string;
  sessions: Session[];
  version: number;
  go: (s: Section) => void;
  onOpenSession: (id: string) => void;
}) {
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard(me.id, today, sessions).then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [me.id, today, sessions, version]);

  return (
    <>
      <h1>Hola, {me.display_name}!</h1>
      <p className="muted" style={{ marginTop: -6 }}>{fmtDate(today)}</p>
      {error && <p className="msg error">{error}</p>}

      <section className="card today-card">
        <h2>Avui</h2>
        {sessions.length === 0 && <p style={{ margin: 0 }}>Avui no hi ha cap sessió. Bon descans!</p>}
        {sessions.map((s) => {
          const m = data?.mine.get(s.id);
          const wClosed = wellnessClosed(s);
          const done = m?.w && m?.r;
          return (
            <div key={s.id} className="today-item">
              <div className="row between">
                <b>{s.name}</b>
                <span className="chip">{s.kind}{s.start_time ? ` · ${fmtSessionTime(s.start_time)}` : ""}</span>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {m?.w ? (
                  <span className="chip fet">Wellness fet</span>
                ) : wClosed ? (
                  <span className="chip band-baix">Wellness tancat</span>
                ) : (
                  <span className="chip pendent">Wellness pendent{s.kind === "Entrenament" ? ` · fins ${WELLNESS_DEADLINE}` : ""}</span>
                )}
                {m?.r ? <span className="chip fet">RPE fet</span> : <span className="chip pendent">RPE pendent · fins 00:00</span>}
              </div>
              <button className={`btn block${done ? " secondary" : ""}`} style={{ marginTop: 10 }} onClick={() => onOpenSession(s.id)}>
                {done ? "Veure o editar" : "Omplir ara"}
              </button>
            </div>
          );
        })}
      </section>

      <div className="tiles">
        <button type="button" className="tile" onClick={() => go("calendari")}>
          {ICONS.calendari}
          <b>Calendari</b>
          <span>{data?.next ? `Propera: ${fmtShort(data.next.session_date)}` : "Les meves sessions"}</span>
        </button>
        <button type="button" className="tile" onClick={() => go("multes")}>
          {ICONS.multes}
          <b>Multes</b>
          <span>{data ? (data.pending ? `Deus ${fmtEuros(data.pending)}` : "Estàs al dia") : "…"}</span>
        </button>
        <button type="button" className={`tile${data && data.reminders !== "on" ? " tile-alert" : ""}`} onClick={() => go("avisos")}>
          {svg("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0")}
          <b>Avisos 7:30</b>
          <span>{data ? (data.reminders === "on" ? "Activats" : "Activa'ls aquí") : "…"}</span>
        </button>
        <button type="button" className="tile" onClick={() => go("stats")}>
          {svg("M4 20V10M10 20V4M16 20v-7M22 20H2")}
          <b>Estadístiques</b>
          <span>Partits, gols i targetes</span>
        </button>
        <button type="button" className="tile" onClick={() => go("normes")}>
          {svg("M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM8 7h8M8 11h6")}
          <b>Normes</b>
          <span>De l&apos;equip</span>
        </button>
      </div>
    </>
  );
}

function SessionForms({ me, session, onSaved }: { me: Profile; session: Session; onSaved: () => void }) {
  const editable = true;
  const wellnessOpen = !wellnessClosed(session);
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
        {!wellnessOpen && (
          <p className="msg error" style={{ marginTop: 0 }}>
            El termini del wellness d&apos;avui ({WELLNESS_DEADLINE}) ja ha passat.
          </p>
        )}
        <WellnessForm sessionId={session.id} existing={w} editable={editable && wellnessOpen} onSaved={(x) => { setW(x); onSaved(); }} />
      </section>
      <section className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>RPE <span className="muted small">(després)</span></h2>
          {r ? <span className="chip fet">Enviat {fmtTime(r.submitted_at)}</span> : <span className="chip pendent">Pendent</span>}
        </div>
        <RpeForm sessionId={session.id} plannedDuration={session.duration_min} existing={r} editable={editable} onSaved={(x) => { setR(x); onSaved(); }} />
      </section>
      <p className="muted small center">
        {session.kind === "Entrenament"
          ? `Límits d'avui: wellness fins a les ${WELLNESS_DEADLINE} · RPE fins a les 00:00. Si no es fan, hi ha multa.`
          : "Pots omplir i modificar les respostes fins a les 00:00 d'avui."}
      </p>
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
