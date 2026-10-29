"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { fetchLeague, ranks, sortLeague } from "@/components/league";
import { fetchAttendance, fetchSessionsBetween, summarize } from "@/lib/attendance";
import { fetchConvocations, fetchRoster } from "@/lib/convo";
import { addDays } from "@/lib/dates";
import { kitFont } from "@/lib/fonts";
import { fetchStreak } from "@/lib/streak";
import { supabase } from "@/lib/supabase";
import { fetchCutout } from "@/lib/player-photos";

type CardData = {
  dorsal: string | null;
  linked: boolean;
  matches: number; starts: number; goals: number;
  attendance: number | null;
  streak: number;
  league: number | null;
};

/** Inici de la temporada (1 d'agost). */
const seasonStart = (today: string) => {
  const y = Number(today.slice(0, 4));
  return `${Number(today.slice(5, 7)) >= 8 ? y : y - 1}-08-01`;
};
const season = (today: string) => {
  const y = Number(seasonStart(today).slice(0, 4));
  return `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
};

async function loadCard(meId: string, today: string): Promise<CardData> {
  const sb = supabase();
  const from = seasonStart(today);
  const [fcf, sessions, streak, league, convos] = await Promise.all([
    sb.from("fcf_players").select("dorsal, matches, starts, goals").eq("profile_id", meId).maybeSingle(),
    fetchSessionsBetween(from, today).catch(() => []),
    fetchStreak(meId, today).catch(() => 0),
    fetchLeague().catch(() => []),
    fetchConvocations(addDays(today, -60)).catch(() => []),
  ]);
  const f = fcf.data as { dorsal: string | null; matches: number; starts: number; goals: number } | null;
  const att = summarize(sessions, await fetchAttendance(sessions.map((s) => s.id), meId).catch(() => []), meId);
  let dorsal = f?.dorsal && /^\d{1,2}$/.test(f.dorsal) ? f.dorsal : null;
  // Sense dorsal a la FCF: el de l'última convocatòria.
  const last = convos[convos.length - 1];
  if (!dorsal && last) {
    const row = (await fetchRoster(last.id).catch(() => [])).find((r) => r.player_id === meId);
    if (row?.dorsal != null) dorsal = String(row.dorsal);
  }
  const sorted = sortLeague(league);
  return {
    dorsal, linked: !!f,
    matches: f?.matches ?? 0, starts: f?.starts ?? 0, goals: f?.goals ?? 0,
    attendance: att.pct, streak, league: ranks(sorted).get(meId) ?? null,
  };
}

/** El cromo de la jugadora, estil FIFA. Només el veu ella. Es pot inclinar amb el dit. */
export function PlayerCard({ meId, name, today }: { meId: string; name: string; today: string }) {
  const [cutout, setCutout] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchCutout(meId).then((x) => alive && setCutout(x), () => {});
    return () => { alive = false; };
  }, [meId]);
  const [d, setD] = useState<CardData | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    loadCard(meId, today).then((x) => alive && setD(x), () => alive && setD({ dorsal: null, linked: false, matches: 0, starts: 0, goals: 0, attendance: null, streak: 0, league: null }));
    return () => { alive = false; };
  }, [meId, today]);

  function tilt(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 16}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
  }
  function reset() {
    const el = ref.current;
    if (!el) return;
    for (const p of ["--rx", "--ry"]) el.style.setProperty(p, "0deg");
    el.style.setProperty("--mx", "50%"); el.style.setProperty("--my", "30%");
  }

  const tier = !d ? "" : d.goals > 0 ? "gold" : d.matches > 0 ? "silver" : "blue";
  const stats: [string, string][] = d ? [
    ["PJ", String(d.matches)], ["TIT", String(d.starts)], ["GOL", String(d.goals)],
    ["ENT", d.attendance == null ? "–" : `${d.attendance}%`], ["🔥", String(d.streak)], ["LLI", d.league == null ? "–" : `#${d.league}`],
  ] : [];
  const [first, ...rest] = name.trim().split(/\s+/);

  return (
    <>
    {cutout && (
      <section className={`p-hero ${kitFont.variable}`} aria-label="El meu perfil">
        <div className="p-hero-text">
          <span className="p-hero-k">El meu perfil{d?.dorsal ? ` · Dorsal ${d.dorsal}` : ""}</span>
          <b className="p-hero-name">{first}</b>
          {rest.length > 0 && <span className="p-hero-surname">{rest.join(" ")}</span>}
          <span className="p-hero-team">Juvenil C · {season(today)}</span>
          {d && (
            <dl className="p-hero-stats">
              {([["PJ", d.matches], ["TIT", d.starts], ["GOL", d.goals], ["ENT", d.attendance == null ? "–" : `${d.attendance}%`]] as [string, string | number][]).map(([k, v]) => (
                <div key={k}><dd>{v}</dd><dt>{k}</dt></div>
              ))}
            </dl>
          )}
        </div>
        <div className="p-hero-photo">
          {d?.dorsal && <span className="p-hero-num" aria-hidden="true">{d.dorsal}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cutout} alt="" />
        </div>
      </section>
    )}
    <div className="pcard-wrap">
      <div ref={ref} className={`pcard ${tier} ${kitFont.variable}${d ? "" : " loading"}${cutout ? " has-photo" : ""}`} onPointerMove={tilt} onPointerLeave={reset} onPointerUp={reset} onPointerCancel={reset}>
        <div className="pcard-holo" aria-hidden="true" />
        <div className="pcard-top">
          <span className="pcard-num">{d?.dorsal ?? "–"}</span>
          <span className="pcard-team">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/escut.png" alt="CE Europa" width={34} height={34} />
            <small>Juv. C<br />{season(today)}</small>
          </span>
        </div>
        {cutout ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pcard-photo" src={cutout} alt="" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pcard-shirt" src="/kits/home.webp" alt="" width={150} height={168} />
        )}
        <div className="pcard-name"><b>{first}</b>{rest.length > 0 && <span>{rest.join(" ")}</span>}</div>
        <dl className="pcard-stats">
          {stats.map(([k, v]) => (<div key={k}><dd>{v}</dd><dt>{k}</dt></div>))}
        </dl>
      </div>
      <p className="muted small pcard-legend">
        PJ partits · TIT titular · GOL gols · ENT entrenaments aquesta temporada · 🔥 wellness seguits · LLI lliga interna.
        {d && !d.linked && " Els números de partit sortiran quan el staff et relacioni amb la fitxa de la FCF."}
      </p>
    </div>
    </>
  );
}
