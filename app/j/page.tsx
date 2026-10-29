"use client";

import { Crest } from "@/components/crest";
import { useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Calendar, StatusChip, type CalItem, type CalStatus } from "@/components/calendar";
import { RpeForm, WellnessForm } from "@/components/forms";
import { FcfStats } from "@/components/fcf-stats";
import { average, daysLeftInMonth, fetchLeague, fmtAvg, qualified, fetchTeamLevel, fetchWinners, LeagueTable, leagueTitle, LevelBadge, ranks, sortLeague, Winners, type LeagueRow, type LeagueWinner } from "@/components/league";
import { PlayerAttendance } from "@/components/player-attendance";
import { RehabCard } from "@/components/rehab-card";
import { PlayerPlanning } from "@/components/weekly-view";
import { BibsCard } from "@/components/bibs";
import { DutiesCard } from "@/components/duties";
import { PlayerTraining } from "@/components/player-training";
import { Confetti, MatchdayHero, ResultCard } from "@/components/matchday";
import { PlayerCard } from "@/components/player-card";
import { Squad } from "@/components/squad";
import { Shirt, useDorsals } from "@/components/shirt";
import { fetchAvatar } from "@/lib/player-photos";
import { AbsenceButton } from "@/components/absence-button";
import { SeasonFx } from "@/components/season";
import { firstName, rememberSplashName } from "@/lib/first-name";
import { MonthStories, MonthWrapBanner } from "@/components/month-wrap";
import { fetchStreak, streakText } from "@/lib/streak";
import { fetchWeeklyPlan, itemTime, type WeeklyPlan } from "@/lib/weekly";
import { nextConvoFor, PlayerConvo } from "@/components/player-convo";
import { hhmm } from "@/lib/convo";
import { PlayerFines } from "@/components/player-fines";
import { fetchAttendance, fetchSessionsBetween, monthBounds, summarize } from "@/lib/attendance";
import { detect as detectReminders, Reminders, type Status as ReminderStatus } from "@/components/reminders";
import { daysToPay, fmtEuros } from "@/lib/fines";
import { Brand, Footer } from "@/components/ui";
import { fmtShort, isoDow, startOfWeek, viewRange, type CalView } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import { transition } from "@/lib/vt";
import {
  bandOf,
  fmtDate,
  fmtSessionTime,
  fmtTime,
  nowMadridHHMM,
  SESSION_COLS,
  dayBefore,
  rpeLate,
  todayMadrid,
  WELLNESS_DEADLINE,
  wellnessLate,
  type Profile,
  type Rpe,
  type Session,
  type Wellness,
} from "@/lib/wellness";
import { Loading } from "@/components/loading";
import { Empty } from "@/components/empty";

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
        {state.kind === "loading" && <Loading />}
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

type Section = "inici" | "avui" | "calendari" | "multes" | "normes" | "avisos" | "stats" | "lliga" | "assistencia" | "convo" | "planning" | "entreno" | "cromo" | "plantilla";
const SECTIONS: Section[] = ["inici", "avui", "calendari", "multes", "normes", "avisos", "stats", "lliga", "assistencia", "convo", "planning", "entreno", "cromo", "plantilla"];

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
  const yesterday = dayBefore(today);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [section, setSection] = useState<Section>("inici");
  const [grow, setGrow] = useState(false);

  useEffect(() => rememberSplashName(me.display_name), [me.display_name]);

  useEffect(() => {
    const sync = () => setSection(sectionFromUrl());
    sync();
    // Enrere/endavant del mòbil: la pantalla llisca (si el navegador ho permet).
    const onPop = () => transition("back", () => flushSync(sync));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      // Crea les sessions que toquin segons les programacions (si encara no existeixen).
      await sb.rpc("generate_rule_sessions");
      const { data, error } = await sb
        .from("sessions")
        .select(SESSION_COLS)
        .gte("session_date", yesterday)
        .lte("session_date", today)
        .order("session_date", { ascending: false })
        .order("start_time", { ascending: true, nullsFirst: true })
        .order("id")
        .range(0, 49);
      if (error) return setError(error.message);
      const list = data as Session[];
      setSessions(list);
      const first = list.find((s) => s.session_date === today);
      if (first) setSelected(first.id);
    })();
  }, [today, yesterday]);

  /** Canvia d'apartat. Si ve d'un mosaic o un avís, aquest «creix» fins a ser la pantalla nova. */
  function go(next: Section, from?: HTMLElement) {
    const run = () => {
      if (next !== section) {
        const url = `${window.location.pathname}${next === "inici" ? "" : `?s=${next}`}${window.location.hash}`;
        window.history.pushState(null, "", url);
        setSection(next);
      }
      window.scrollTo({ top: 0 });
    };
    if (next === section) return run();
    if (from) from.style.viewTransitionName = "panel";
    transition(from ? "grow" : "slide", () => {
      if (from) from.style.viewTransitionName = "";
      flushSync(() => {
        setGrow(!!from);
        run();
      });
    }, () => setGrow(false));
  }

  function openSession(id: string) {
    setSelected(id);
    go("avui");
  }

  const session = sessions?.find((s) => s.id === selected) ?? null;
  const todaySessions = sessions?.filter((s) => s.session_date === today) ?? [];
  // Sessions d'ahir: l'RPE encara es pot fer (fora de termini) fins a les 23:59 d'avui.
  const yesterdaySessions = sessions?.filter((s) => s.session_date === yesterday && !s.cancelled) ?? [];
  // A "Avui" hi surten les sessions d'avui i, si se n'ha obert una d'ahir, també aquella.
  const tabSessions = session && session.session_date !== today ? [...todaySessions, session] : todaySessions;
  const saved = () => setVersion((v) => v + 1);

  return (
    <div className="player-app">
      <div className="section-view" style={grow ? { viewTransitionName: "panel" } : undefined}>
      {error && <p className="msg error">{error}</p>}
      {sessions === null && !error && <Loading />}

      {sessions !== null && section === "inici" && (
        <Dashboard me={me} today={today} sessions={todaySessions} yesterdaySessions={yesterdaySessions} version={version} go={go} onOpenSession={openSession} />
      )}

      {sessions !== null && section === "avui" && (
        <>
          <h1>Avui</h1>
          <p className="muted" style={{ marginTop: -6 }}>{fmtDate(today)}</p>
          {tabSessions.length === 0 && (
            <div className="card">
              <Empty compact art="rest" title="Avui no hi ha cap sessió programada" />
            </div>
          )}
          {tabSessions.length > 1 && (
            <div className="tabs" style={{ marginBottom: 12 }}>
              {tabSessions.map((s) => (
                <button key={s.id} aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>
                  {s.session_date !== today && "Ahir · "}
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
        <PlayerCalendar me={me} today={today} version={version} onOpenSession={openSession} />
      )}

      {sessions !== null && section === "multes" && <PlayerFines playerId={me.id} />}
      {sessions !== null && section === "normes" && <PlayerFines playerId={me.id} rulesOpen />}
      {sessions !== null && section === "stats" && <FcfStats mode="player" meId={me.id} />}
      {sessions !== null && section === "lliga" && <PlayerLeague meId={me.id} />}
      {sessions !== null && section === "assistencia" && <PlayerAttendance meId={me.id} />}
      {sessions !== null && section === "convo" && <PlayerConvo meId={me.id} />}
      {sessions !== null && section === "planning" && <PlayerPlanning meId={me.id} />}
      {sessions !== null && section === "entreno" && <PlayerTraining />}
      {sessions !== null && section === "plantilla" && <Squad meId={me.id} />}
      {sessions !== null && section === "cromo" && (
        <>
          <h1>El meu cromo</h1>
          <PlayerCard meId={me.id} name={me.display_name} today={today} />
          <MyMonthButton meId={me.id} name={me.display_name} today={today} />
        </>
      )}

      {sessions !== null && section === "avisos" && (
        <>
          <h1>Avisos</h1>
          <Reminders />
        </>
      )}

      </div>

      <nav className="bottom-nav" aria-label="Menú">
        {([
          ["inici", "Inici", ICONS.inici],
          ["avui", "Avui", ICONS.avui],
          ["calendari", "Calendari", ICONS.calendari],
          ["lliga", "Lliga", ICONS.lliga],
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
const ICONS: Record<"inici" | "avui" | "calendari" | "multes" | "lliga", ReactNode> = {
  lliga: svg("M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"),
  inici: svg("M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"),
  avui: svg("M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"),
  calendari: svg("M7 3v4M17 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"),
  multes: svg("M18.5 6.5A7 7 0 1 0 18.5 17.5M4 10.5h10M4 13.5h10"),
};

type DashData = {
  level: number | null;
  leaguePos: { pos: number | null; avg: number | null; missing: number; total: number } | null;
  mine: Map<string, { w: boolean; r: boolean }>;
  pending: number;
  next: Session | null;
  reminders: ReminderStatus;
  attendance: { present: number; marked: number; pct: number | null } | null;
  convo: Awaited<ReturnType<typeof nextConvoFor>>;
  plan: WeeklyPlan | null;
  trainingToday: boolean;
  streak: number | null;
  fineDays: number | null; // dies que queden per pagar la multa que caduca abans
};

async function loadMonthAttendance(playerId: string, today: string) {
  const sessions = await fetchSessionsBetween(monthBounds(today).from, today);
  return summarize(sessions, await fetchAttendance(sessions.map((s) => s.id), playerId), playerId);
}

async function loadDashboard(playerId: string, today: string, sessions: Session[]): Promise<DashData> {
  const sb = supabase();
  const ids = sessions.map((s) => s.id);
  const [w, r, fines, next, reminders, level, league, attendance, convo, plan, pub, streak] = await Promise.all([
    ids.length ? sb.from("wellness").select("session_id").eq("player_id", playerId).in("session_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? sb.from("rpe").select("session_id").eq("player_id", playerId).in("session_id", ids) : Promise.resolve({ data: [], error: null }),
    fetchAll<{ amount_cents: number; paid: boolean; due_date: string | null; doubled_at: string | null }>((f, t) =>
      sb.from("fines").select("amount_cents, paid, due_date, doubled_at").eq("person_id", playerId).order("id").range(f, t),
    ),
    sb.from("sessions").select(SESSION_COLS).gt("session_date", today)
      .order("session_date").order("start_time", { nullsFirst: true }).order("id").range(0, 0),
    detectReminders().catch((): ReminderStatus => "unsupported"),
    fetchTeamLevel().catch(() => null),
    fetchLeague().catch((): LeagueRow[] => []),
    loadMonthAttendance(playerId, today).catch(() => null),
    nextConvoFor(playerId, today).catch(() => null),
    fetchWeeklyPlan(startOfWeek(today)).catch(() => null),
    sb.from("published_trainings").select("plan_id").eq("plan_date", today).range(0, 0),
    fetchStreak(playerId, today).catch(() => null),
  ]);
  for (const res of [w, r, next]) if (res.error) throw new Error(res.error.message);
  const mine = new Map<string, { w: boolean; r: boolean }>();
  for (const id of ids) mine.set(id, { w: false, r: false });
  for (const x of (w.data ?? []) as { session_id: string }[]) mine.get(x.session_id)!.w = true;
  for (const x of (r.data ?? []) as { session_id: string }[]) mine.get(x.session_id)!.r = true;
  const sorted = sortLeague(league);
  const myRow = sorted.find((x) => x.profile_id === playerId);
  return {
    level,
    leaguePos: myRow
      ? { pos: ranks(sorted).get(playerId) ?? null, avg: average(myRow), missing: Math.max(0, myRow.min_trainings - myRow.trainings), total: sorted.filter(qualified).length }
      : null,
    mine,
    pending: fines.filter((f) => !f.paid).reduce((a, f) => a + f.amount_cents, 0),
    fineDays: fines.map((f) => daysToPay(f, today)).reduce<number | null>((m, d) => (d == null ? m : m == null ? d : Math.min(m, d)), null),
    next: ((next.data ?? []) as Session[])[0] ?? null,
    reminders,
    attendance,
    convo,
    plan,
    trainingToday: !pub.error && (pub.data ?? []).length > 0,
    streak,
  };
}

/** Lliga interna: classificació de tot l'equip, amb animació des de l'inici del mes. */
function PlayerLeague({ meId }: { meId: string }) {
  const today = todayMadrid();
  const [rows, setRows] = useState<LeagueRow[] | null>(null);
  const [winners, setWinners] = useState<LeagueWinner[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchLeague().then(setRows, (e) => setError(e instanceof Error ? e.message : String(e)));
    fetchWinners().then(setWinners, () => {});
  }, []);
  const left = daysLeftInMonth(today);
  return (
    <>
      <h1>{leagueTitle(today)}</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Promig = punts ÷ entrenaments. Cal un mínim de {rows?.[0]?.min_trainings ?? 6} entrenaments per classificar-se; guanya el millor promig.{" "}
        {left === 1 ? "Avui és l'últim dia del mes!" : `Queden ${left} dies.`} Les fletxes indiquen qui ha pujat o baixat des d&apos;ahir.
      </p>
      {error && <p className="msg error">{error}</p>}
      {!rows && !error && <Loading />}
      {rows && (
        <section className="card">
          <LeagueTable rows={rows} meId={meId} fromPrevious />
        </section>
      )}
      <section className="card">
        <h2>Guanyadores</h2>
        <Winners winners={winners} />
      </section>
    </>
  );
}

/** Al cromo: el resum del mes en curs (fins avui). */
function MyMonthButton({ meId, name, today }: { meId: string; name: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="mw-banner" onClick={() => setOpen(true)} style={{ marginTop: 14 }}>
        <span className="mw-banner-k">🎬 El teu mes</span>
        <b>Com t&apos;està anant aquest mes</b>
        <span>Entrenaments, wellness, partits i lliga ›</span>
      </button>
      {open && <MonthStories meId={meId} name={name} day={today} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}

const GREET = { mati: "Bon dia", tarda: "Bona tarda", nit: "Bona nit" } as const;
const dayPart = (hhmm: string): keyof typeof GREET => (hhmm >= "06:00" && hhmm < "13:00" ? "mati" : hhmm >= "13:00" && hhmm < "20:00" ? "tarda" : "nit");

/** Salutació segons l'hora, amb el cel de fons: sol al matí, posta a la tarda i estrelles a la nit. */
function Greeting({ name, today, level, meId, onMe }: { name: string; today: string; level: number | null; meId: string; onMe: (el: HTMLElement) => void }) {
  const [part, setPart] = useState<keyof typeof GREET>(() => dayPart(nowMadridHHMM()));
  useEffect(() => {
    const id = setInterval(() => setPart(dayPart(nowMadridHHMM())), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className={`greet ${part}`}>
      <span className="greet-sky" aria-hidden="true" />
      <MeAvatar meId={meId} onClick={onMe} />
      <h1>{GREET[part]}, {name}!</h1>
      <p className="row" style={{ gap: 8, margin: 0 }}>
        <span>{fmtDate(today)}</span>
        {level ? <LevelBadge level={level} /> : null}
      </p>
      <SeasonFx today={today} />
    </header>
  );
}

/** La seva foto (o la samarreta amb el dorsal) a la salutació. Porta al seu cromo. */
function MeAvatar({ meId, onClick }: { meId: string; onClick: (el: HTMLElement) => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const me = useDorsals().get(meId);
  useEffect(() => {
    let alive = true;
    fetchAvatar(meId).then((x) => alive && setThumb(x), () => {});
    return () => { alive = false; };
  }, [meId]);
  return (
    <button type="button" className={`greet-me${thumb ? " photo" : ""}${me?.gk ? " gk" : ""}`} onClick={(e) => onClick(e.currentTarget)} aria-label="El meu cromo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {thumb ? <img src={thumb} alt="" /> : <Shirt n={me?.n} gk={me?.gk} size={40} />}
    </button>
  );
}

/** Ratxa de wellness. Quan puja, la flama salta; cada 5 seguits, confeti. */
function StreakCard({ meId, n }: { meId: string; n: number }) {
  const [up, setUp] = useState(false);
  const [party, setParty] = useState(false);
  useEffect(() => {
    const key = `ratxa:${meId}`;
    let prev: number | null = null;
    try { const v = localStorage.getItem(key); prev = v == null ? null : Number(v); localStorage.setItem(key, String(n)); } catch { /* sense emmagatzematge */ }
    if (prev == null || n <= prev) return;
    const t = setTimeout(() => { setUp(true); if (n % 5 === 0) setParty(true); }, 0);
    return () => clearTimeout(t);
  }, [meId, n]);
  return (
    <section className={`card streak-card${n >= 5 ? " hot" : ""}${up ? " up" : ""}`}>
      {party && <Confetti onDone={() => setParty(false)} />}
      <span className="streak-flame" aria-hidden="true">{n > 0 ? "🔥" : "💤"}</span>
      <div>
        <b>{n === 1 ? "1 wellness seguit" : `${n} wellness seguits`}</b>
        <span className="muted small">{streakText(n)}</span>
      </div>
      {n > 0 && <span className="streak-n" key={n}>{n}</span>}
    </section>
  );
}

/** Inici: resum d'avui i accessos a cada apartat. */
function Dashboard({
  me, today, sessions, yesterdaySessions, version, go, onOpenSession,
}: {
  me: Profile;
  today: string;
  sessions: Session[];
  yesterdaySessions: Session[];
  version: number;
  go: (s: Section, from?: HTMLElement) => void;
  onOpenSession: (id: string) => void;
}) {
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard(me.id, today, [...sessions, ...yesterdaySessions]).then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [me.id, today, sessions, yesterdaySessions, version]);

  const lateRpe = data ? yesterdaySessions.filter((s) => !data.mine.get(s.id)?.r) : [];

  return (
    <>
      <Greeting name={firstName(me.display_name)} today={today} level={data?.level ?? null} meId={me.id} onMe={(el) => go("cromo", el)} />
      {error && <p className="msg error">{error}</p>}

      <MonthWrapBanner meId={me.id} name={me.display_name} today={today} />

      <ResultCard today={today} />

      {data?.convo && data.convo.c.match_date === today && (
        <MatchdayHero c={data.convo.c} called={data.convo.called} onOpen={() => go("convo")} />
      )}

      {data?.convo && data.convo.c.match_date !== today && (
        <button type="button" className={`convo-banner ${data.convo.called ? "yes" : "no"}`} onClick={(e) => go("convo", e.currentTarget)}>
          <span className="convo-banner-k">Convocatòria · {fmtShort(data.convo.c.match_date)}{data.convo.c.kickoff ? ` · ${hhmm(data.convo.c.kickoff)} h` : ""}</span>
          <b className="team-inline"><Crest name={data.convo.c.rival} size={30} />{data.convo.c.is_home ? `CE Europa – ${data.convo.c.rival}` : `${data.convo.c.rival} – CE Europa`}</b>
          <span>{data.convo.called ? "✓ Estàs convocada · Veure la convocatòria" : "Veure la convocatòria"}</span>
        </button>
      )}

      {data?.plan && (() => {
        const d = data.plan.days[isoDow(today) - 1];
        const rest = !d || d.rest || d.items.length === 0;
        return (
          <button type="button" className="wk-banner" onClick={(e) => go("planning", e.currentTarget)}>
            <span className="wk-banner-k">🗓️ Planning de la setmana · Avui</span>
            {rest ? <b>Descans 😴</b> : (
              <span className="wk-banner-items">
                {d.items.slice(0, 4).map((it, j) => <span key={j}>{itemTime(it) && <b>{itemTime(it)}</b>} {it.icon} {it.text}</span>)}
              </span>
            )}
            <span className="wk-banner-more">Veure tota la setmana ›</span>
          </button>
        );
      })()}

      {data?.trainingToday && (
        <button type="button" className="wk-banner train" onClick={(e) => go("entreno", e.currentTarget)}>
          <span className="wk-banner-k">📋 Entreno d&apos;avui</span>
          <b>Ja està penjat. Mira les tasques i els equips!</b>
          <span className="wk-banner-more">Veure l&apos;entreno ›</span>
        </button>
      )}

      {data?.streak != null && <StreakCard meId={me.id} n={data.streak} />}

      <BibsCard meId={me.id} today={today} />
      <DutiesCard meId={me.id} title="Material i porteria" />

      <RehabCard meId={me.id} today={today} />

      <section className="card today-card">
        <h2>Avui</h2>
        {sessions.length === 0 && <Empty compact art="rest" title="Avui no hi ha cap sessió" hint="Bon descans! 😴" />}
        {sessions.map((s) => {
          const m = data?.mine.get(s.id);
          const wLate = wellnessLate(s);
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
                ) : wLate ? (
                  <span className="chip band-baix">Wellness fora de termini</span>
                ) : (
                  <span className="chip pendent">Wellness pendent{s.kind === "Entrenament" ? ` · fins ${WELLNESS_DEADLINE}` : ""}</span>
                )}
                {m?.r ? <span className="chip fet">RPE fet</span> : <span className="chip pendent">RPE pendent · fins 00:00</span>}
              </div>
              <button className={`btn block${done ? " secondary" : ""}`} style={{ marginTop: 10 }} onClick={() => onOpenSession(s.id)}>
                {done ? "Veure o editar" : "Omplir ara"}
              </button>
              <AbsenceButton session={s} meId={me.id} />
            </div>
          );
        })}
      </section>

      {lateRpe.length > 0 && (
        <section className="card today-card">
          <h2>Pendent d&apos;ahir</h2>
          {lateRpe.map((s) => (
            <div key={s.id} className="today-item">
              <div className="row between">
                <b>{s.name}</b>
                <span className="chip">{s.kind}{s.start_time ? ` · ${fmtSessionTime(s.start_time)}` : ""}</span>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="chip band-baix">RPE fora de termini · fins avui 23:59</span>
              </div>
              <button className="btn block" style={{ marginTop: 10 }} onClick={() => onOpenSession(s.id)}>Fer l&apos;RPE ara</button>
            </div>
          ))}
        </section>
      )}

      <div className="tiles">
        <button type="button" className="tile" onClick={(e) => go("calendari", e.currentTarget)}>
          {ICONS.calendari}
          <b>Calendari</b>
          <span>{data?.next ? `Propera: ${fmtShort(data.next.session_date)}` : "Les meves sessions"}</span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("multes", e.currentTarget)}>
          {ICONS.multes}
          <b>Multes</b>
          <span>
            {data ? (data.pending ? `Deus ${fmtEuros(data.pending)}` : "Estàs al dia") : "…"}
            {data?.fineDays != null && <><br />{data.fineDays === 0 ? "⏳ Avui últim dia!" : `⏳ ${data.fineDays} ${data.fineDays === 1 ? "dia" : "dies"} per pagar`}</>}
          </span>
        </button>
        <button type="button" className={`tile${data && data.reminders !== "on" ? " tile-alert" : ""}`} onClick={(e) => go("avisos", e.currentTarget)}>
          {svg("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0")}
          <b>Avisos</b>
          <span>{data ? (data.reminders === "on" ? "Activats" : "Activa'ls aquí") : "…"}</span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("lliga", e.currentTarget)}>
          {ICONS.lliga}
          <b>Lliga interna</b>
          <span>
            {!data?.leaguePos
              ? leagueTitle(today)
              : data.leaguePos.pos != null
                ? `${data.leaguePos.pos}a · promig ${fmtAvg(data.leaguePos.avg)}`
                : `Et falten ${data.leaguePos.missing} entrenaments`}
          </span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("convo", e.currentTarget)}>
          {svg("M9 3h6l1 3h4v15H4V6h4zM9 12l2 2 4-4")}
          <b>Convocatòria</b>
          <span>{data?.convo ? (data.convo.called ? "Estàs convocada ✓" : "Ja està penjada") : "Encara no n'hi ha"}</span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("assistencia", e.currentTarget)}>
          {svg("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 11l2 2 4-4")}
          <b>Assistència</b>
          <span>
            {!data
              ? "…"
              : data.attendance?.marked
                ? `${data.attendance.present} de ${data.attendance.marked} · ${data.attendance.pct}%`
                : "Encara sense dades"}
          </span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("entreno", e.currentTarget)}>
          {svg("M9 3h6v4H9zM5 5h4M15 5h4v16H5V5M8 12h8M8 16h5")}
          <b>Entreno</b>
          <span>{data?.trainingToday ? "El d'avui ja està penjat" : "Els entrenos penjats"}</span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("planning", e.currentTarget)}>
          {ICONS.calendari}
          <b>Planning</b>
          <span>{data?.plan ? "La setmana" : "Encara no penjat"}</span>
        </button>
        <button type="button" className="tile tile-cromo" onClick={(e) => go("cromo", e.currentTarget)}>
          {svg("M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 7h6M8 17h8M12 10l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 16l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z")}
          <b>El meu cromo</b>
          <span>La teva carta de jugadora</span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("plantilla", e.currentTarget)}>
          {svg("M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6")}
          <b>La plantilla</b>
          <span>Totes les companyes</span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("stats", e.currentTarget)}>
          {svg("M4 20V10M10 20V4M16 20v-7M22 20H2")}
          <b>Estadístiques</b>
          <span>Partits, gols i targetes</span>
        </button>
        <button type="button" className="tile" onClick={(e) => go("normes", e.currentTarget)}>
          {svg("M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM8 7h8M8 11h6")}
          <b>Normes</b>
          <span>De l&apos;equip</span>
        </button>
      </div>
    </>
  );
}

function SessionForms({ me, session, onSaved }: { me: Profile; session: Session; onSaved: () => void }) {
  const isToday = session.session_date === todayMadrid();
  const wLate = wellnessLate(session);
  const rLate = rpeLate(session);
  const training = session.kind === "Entrenament";
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
  if (w === undefined || r === undefined) return <Loading />;

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
        {!isToday && <p className="muted small" style={{ margin: "6px 0 0" }}>Ahir · {fmtDate(session.session_date)}</p>}
      </div>
      <section className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Wellness <span className="muted small">(abans)</span></h2>
          {w ? <span className="chip fet">Enviat {fmtTime(w.submitted_at)}</span> : <span className="chip pendent">Pendent</span>}
        </div>
        {!isToday ? (
          <p className="msg info" style={{ marginTop: 0 }}>El wellness d&apos;ahir ja està tancat.</p>
        ) : wLate && !w ? (
          <p className="msg warn" style={{ marginTop: 0 }}>
            Fora de termini (era fins a les {WELLNESS_DEADLINE}). Encara el pots fer fins a les 23:59, però es posarà la multa automàtica.
          </p>
        ) : null}
        {(isToday || w) && <WellnessForm sessionId={session.id} existing={w} editable={isToday} onSaved={(x) => { setW(x); onSaved(); }} />}
      </section>
      <section className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>RPE <span className="muted small">(després)</span></h2>
          {r ? <span className="chip fet">Enviat {fmtTime(r.submitted_at)}</span> : <span className="chip pendent">Pendent</span>}
        </div>
        {rLate && !r && (
          <p className="msg warn" style={{ marginTop: 0 }}>
            Fora de termini (era fins a les 00:00). Encara el pots fer fins avui a les 23:59{training ? ", però es posarà la multa automàtica" : ""}.
          </p>
        )}
        <RpeForm sessionId={session.id} plannedDuration={session.duration_min} existing={r} editable onSaved={(x) => { setR(x); onSaved(); }} />
      </section>
      <p className="muted small center">
        {training
          ? `Terminis: wellness fins a les ${WELLNESS_DEADLINE} · RPE fins a les 00:00. Fora de termini encara es poden fer (wellness fins a les 23:59 i RPE fins a les 23:59 de l'endemà), però hi ha multa.`
          : "Pots fer el wellness fins a les 23:59 d'avui i l'RPE fins a les 23:59 de demà."}
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
function PlayerCalendar({ me, today, version, onOpenSession }: { me: Profile; today: string; version: number; onOpenSession: (id: string) => void }) {
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
      <h1>El meu calendari</h1>
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
              {s.session_date >= today && <AbsenceButton session={s} meId={me.id} />}
              {(m.w || m.r) && (
                <div className="row" style={{ marginTop: 6 }}>
                  {m.w && <span className={`chip ${bandOf(Number(m.w.score)).cls}`}>Wellness {Number(m.w.score).toFixed(1)}</span>}
                  {m.r && <span className="chip">RPE {m.r.rpe}</span>}
                  {m.r?.load != null && <span className="chip">Càrrega {m.r.load}</span>}
                </div>
              )}
              {s.session_date === today && (
                <button className="btn small" style={{ marginTop: 8 }} onClick={() => onOpenSession(s.id)}>
                  {status === "completada" ? "Veure o editar" : "Omplir ara"}
                </button>
              )}
              {s.session_date === dayBefore(today) && !s.cancelled && (
                <button className="btn small" style={{ marginTop: 8 }} onClick={() => onOpenSession(s.id)}>
                  {m.r ? "Veure o editar l'RPE" : "Fer l'RPE (fora de termini)"}
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
