"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CoachToday } from "@/components/coach-today";
import { DutiesCard } from "@/components/duties";
import { Shirt, useDorsals } from "@/components/shirt";
import { fetchBibs } from "@/lib/bibs";
import { firstName, rememberSplashName } from "@/lib/first-name";
import { fetchConvocations, hhmm, type Convocation } from "@/lib/convo";
import { fmtShort, startOfWeek } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import { fetchWeeklyPlan } from "@/lib/weekly";
import { fmtDate, fmtSessionTime, nowMadridHHMM, SESSION_COLS, type Session } from "@/lib/wellness";

type Info = {
  next: Session | null;
  injured: { id: string; name: string; since: string }[];
  convo: Convocation | null;
  planPublished: boolean | null;
  bibs: { player_id: string; display_name: string; dorsal: number | null } | null;
};

async function loadInfo(today: string): Promise<Info> {
  const sb = supabase();
  const [next, inj, players, convos, plan, bibs] = await Promise.all([
    sb.from("sessions").select(SESSION_COLS).gt("session_date", today).eq("cancelled", false)
      .order("session_date").order("start_time", { nullsFirst: true }).order("id").range(0, 0),
    fetchAll<{ player_id: string; start_date: string }>((f, t) =>
      sb.from("injuries").select("player_id, start_date").lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("start_date").order("id").range(f, t)),
    fetchAll<{ id: string; display_name: string }>((f, t) => sb.from("profiles").select("id, display_name").eq("role", "player").order("id").range(f, t)),
    fetchConvocations(today).catch(() => []),
    fetchWeeklyPlan(startOfWeek(today)).catch(() => null),
    fetchBibs(today, today).catch(() => []),
  ]);
  const name = new Map(players.map((p) => [p.id, p.display_name]));
  const seen = new Set<string>();
  return {
    next: ((next.data ?? []) as Session[])[0] ?? null,
    injured: inj.filter((i) => !seen.has(i.player_id) && seen.add(i.player_id)).map((i) => ({ id: i.player_id, name: name.get(i.player_id) ?? "?", since: i.start_date })),
    convo: convos[0] ?? null,
    planPublished: plan ? plan.published : null,
    bibs: bibs[0] ?? null,
  };
}

const GREET = (hhmm: string) => (hhmm >= "06:00" && hhmm < "13:00" ? ["mati", "Bon dia"] : hhmm >= "13:00" && hhmm < "20:00" ? ["tarda", "Bona tarda"] : ["nit", "Bona nit"]);

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const TILES: { href: string; label: string; sub: string; icon: ReactNode; owner?: boolean }[] = [
  { href: "/entrenador/convocatoria", label: "Convocatòria", sub: "Llista, onze i amistosos", icon: svg("M9 3h6l1 3h4v15H4V6h4zM9 12l2 2 4-4") },
  { href: "/entrenador/assistencia", label: "Llista", sub: "Passar llista", icon: svg("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 11l2 2 4-4") },
  { href: "/entrenador/planning", label: "Planning", sub: "La setmana i petos", icon: svg("M7 3v4M17 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z") },
  { href: "/entrenador/carrega", label: "Càrrega", sub: "ACWR i RPE", icon: svg("M3 12h4l3-8 4 16 3-8h4") },
  { href: "/entrenador/estadistiques", label: "Stats", sub: "Partits, gols i targetes", icon: svg("M4 20V10M10 20V4M16 20v-7M22 20H2") },
  { href: "/entrenador/equip", label: "Equip", sub: "Lesionades i lliga", icon: svg("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75") },
  { href: "/entrenador/multes", label: "Multes", sub: "Posar i cobrar", icon: svg("M18.5 6.5A7 7 0 1 0 18.5 17.5M4 10.5h10M4 13.5h10") },
  { href: "/entrenador/programacio", label: "Programacions", sub: "Sessions automàtiques", icon: svg("M21 12a9 9 0 1 1-3-6.7M21 4v5h-5") },
  { href: "/entrenador/plantilla", label: "Plantilles", sub: "Entrenos i PDF", owner: true, icon: svg("M9 3h6v4H9zM5 5h4M15 5h4v16H5V5M8 12h8M8 16h5") },
  { href: "/entrenador/analisi", label: "Anàlisi", sub: "Vídeo i talls", owner: true, icon: svg("M15 10l5-3v10l-5-3zM3 6h12v12H3z") },
  { href: "/entrenador/bigdata", label: "Big Data", sub: "La lliga en números", owner: true, icon: svg("M3 3v18h18M7 15l4-4 3 3 5-6") },
];

/** Inici del staff: salutació, l'entreno d'avui (o el proper), avisos, el vestidor d'avui i accessos ràpids. */
export function StaffHome({ name, today, owner }: { name: string; today: string; owner: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [part, hello] = GREET(nowMadridHHMM());
  const dorsals = useDorsals();
  useEffect(() => rememberSplashName(name), [name]);
  useEffect(() => {
    let alive = true;
    loadInfo(today).then((x) => alive && setInfo(x), () => {});
    return () => { alive = false; };
  }, [today]);

  const alerts: { key: string; tone: "red" | "gold" | "ok"; body: ReactNode; href?: string }[] = [];
  if (info) {
    const c = info.convo;
    if (c && !c.published) alerts.push({ key: "convo", tone: "gold", href: "/entrenador/convocatoria", body: <>La convocatòria de <b>{fmtShort(c.match_date)}</b> contra <b>{c.rival}</b> encara no està publicada</> });
    else if (c) alerts.push({ key: "convo", tone: "ok", href: "/entrenador/convocatoria", body: <>Convocatòria de <b>{fmtShort(c.match_date)}</b>{c.kickoff ? ` (${hhmm(c.kickoff)} h)` : ""} contra <b>{c.rival}</b> publicada ✓</> });
    if (info.planPublished !== true) alerts.push({ key: "plan", tone: "gold", href: "/entrenador/planning", body: info.planPublished === false ? <>El planning d&apos;aquesta setmana està fet però <b>no publicat</b></> : <>El planning d&apos;aquesta setmana encara <b>no està fet</b></> });
  }

  return (
    <div className="staff-home">
      <header className={`greet ${part}`}>
        <span className="greet-sky" aria-hidden="true" />
        <h1>{hello}, {firstName(name)}!</h1>
        <p className="row" style={{ gap: 8, margin: 0 }}><span>{fmtDate(today)}</span></p>
      </header>

      <CoachToday today={today} />
      {info?.next && <NextUp s={info.next} today={today} />}

      {info && (alerts.length > 0 || info.injured.length > 0) && (
        <section className="card sh-alerts">
          <h2>Avisos</h2>
          <ul>
            {alerts.map((a) => (
              <li key={a.key} className={a.tone}>
                {a.href ? <Link href={a.href}>{a.body} ›</Link> : a.body}
              </li>
            ))}
            {info.injured.length > 0 && (
              <li className="red">
                <Link href="/entrenador/equip">
                  <b>{info.injured.length} {info.injured.length === 1 ? "lesionada" : "lesionades"}</b> ›
                </Link>
                <span className="sh-injured">
                  {info.injured.map((i) => (
                    <span key={i.id}><Shirt n={dorsals.get(i.id)?.n} gk={dorsals.get(i.id)?.gk} size={22} />{i.name}<small> · des del {fmtShort(i.since)}</small></span>
                  ))}
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      {info && (
        <div className="sh-today">
          {info.bibs && (
            <section className="card sh-bibs">
              <h2>🦺 Petos avui</h2>
              <p><Shirt n={info.bibs.dorsal} gk={dorsals.get(info.bibs.player_id)?.gk} size={34} /><b>{info.bibs.display_name}</b></p>
            </section>
          )}
          <DutiesCard title="Material i porteria" />
        </div>
      )}

      <div className="tiles staff-tiles">
        {TILES.filter((t) => !t.owner || owner).map((t) => (
          <Link key={t.href} href={t.href} className="tile">
            {t.icon}
            <b>{t.label}</b>
            <span>{t.sub}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Quan avui no hi ha sessió (o ja ha passat): la propera. */
function NextUp({ s, today }: { s: Session; today: string }) {
  const [hasToday, setHasToday] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    supabase().from("sessions").select("id").eq("session_date", today).eq("cancelled", false).range(0, 0)
      .then(({ data }) => alive && setHasToday((data ?? []).length > 0));
    return () => { alive = false; };
  }, [today]);
  if (hasToday !== false) return null;
  return (
    <Link href={`/entrenador/sessio?id=${s.id}`} className="coach-today next-up">
      <span className="ct-k">Avui no hi ha sessió · La propera</span>
      <b className="ct-title">{s.name}</b>
      <span className="ct-sub">{fmtDate(s.session_date)}{s.start_time ? ` · ${fmtSessionTime(s.start_time)}` : ""} · {s.kind}</span>
    </Link>
  );
}
