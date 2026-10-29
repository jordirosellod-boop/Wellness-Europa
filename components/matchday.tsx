"use client";

import { useEffect, useRef, useState } from "react";
import { Crest } from "@/components/crest";
import { ResultStoryButton } from "@/components/convo-story";
import { prettyTeam } from "@/lib/analysis";
import { fetchRoster, hhmm, KITS, kitOf, type Convocation, type RosterRow } from "@/lib/convo";
import { fetchAvatars } from "@/lib/player-photos";
import { madridEpoch, outcome, phaseOf, recentResult, split, type FcfResult } from "@/lib/matchday";

const COLORS = ["#022e91", "#ffffff", "#dbb34d", "#f3dc9a", "#3b5fd1"];

/** Confeti amb els colors del club (canvas, uns 3 segons). No surt si el mòbil demana menys moviment. */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { done.current?.(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
    const parts = Array.from({ length: 140 }, (_, i) => {
      const left = i % 2 === 0;
      return {
        x: left ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.3),
        vx: (left ? 1 : -1) * (4 + Math.random() * 7), vy: -(9 + Math.random() * 9),
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        c: COLORS[i % COLORS.length],
      };
    });
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, el - 2400) / 800);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2);
        ctx.restore();
      }
      if (el < 3200) raf = requestAnimationFrame(tick);
      else done.current?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");
const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/** El dia del partit, a dalt de tot de l'inici: cartell, compte enrere i com arribar. */
export function MatchdayHero({ c, called, onOpen }: { c: Convocation; called: boolean; onOpen: () => void }) {
  const now = useNow();
  const meet = c.meet_time ? madridEpoch(c.match_date, c.meet_time) : null;
  const ko = c.kickoff ? madridEpoch(c.match_date, c.kickoff) : null;
  const phase = phaseOf(now, meet, ko);
  const target = phase === "abans" ? meet ?? ko : phase === "quedada" ? ko : null;
  const left = target != null ? split(target - now) : null;
  const home = c.is_home ? "CE Europa" : c.rival;
  const away = c.is_home ? c.rival : "CE Europa";
  const kitKey = kitOf(c.kit);
  const kit = kitKey ? KITS.find((k) => k.key === kitKey) : null;
  const place = [c.venue, c.address].filter(Boolean).join(", ");

  return (
    <section className={`matchday phase-${phase}`} aria-label="Dia de partit">
      <span className="md-kicker">⚽ Dia de partit{c.competition ? ` · ${c.competition}` : ""}</span>
      <div className="md-teams">
        <span className={c.is_home ? "us" : ""}><Crest name={home} size={64} className="md-crest" /><b>{home}</b></span>
        <i>vs</i>
        <span className={c.is_home ? "" : "us"}><Crest name={away} size={64} className="md-crest" /><b>{away}</b></span>
      </div>

      {left && (
        <div className="md-count" role="timer" aria-live="off">
          <span className="md-count-k">{phase === "abans" && meet ? "Falta per a la quedada" : "Falta perquè comenci"}</span>
          <div className="md-digits">
            <span><b>{pad(left.h)}</b><small>h</small></span><em>:</em>
            <span><b>{pad(left.m)}</b><small>min</small></span><em>:</em>
            <span><b key={left.s} className="tick">{pad(left.s)}</b><small>s</small></span>
          </div>
        </div>
      )}
      {phase === "joc" && <p className="md-live"><span className="dot" /> En joc · Força Europa!</p>}
      {phase === "final" && <p className="md-live done">Partit acabat · Gràcies per l&apos;esforç 💙</p>}

      <CalledFaces cid={c.id} onOpen={onOpen} />

      <div className="md-chips">
        {c.meet_time && <span>🕘 Quedada {hhmm(c.meet_time)} h</span>}
        {c.kickoff && <span>⚽ Partit {hhmm(c.kickoff)} h</span>}
        <span>{c.is_home ? "🏠 Local" : "🚌 Visitant"}</span>
      </div>

      {(kit || c.kit) && (
        <div className="md-kit">
          {kit && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={kit.img} alt="" width={64} height={72} />
          )}
          <span>Equipació<b>{kit ? kit.label : c.kit}</b></span>
        </div>
      )}

      <p className={`md-me ${called ? "yes" : "no"}`}>{called ? "✓ Estàs convocada" : "Avui no estàs convocada · anima l'equip!"}</p>

      <div className="md-actions">
        {place && <a className="btn" href={mapsUrl(place)} target="_blank" rel="noreferrer">📍 Com arribar</a>}
        <button type="button" className="btn secondary" onClick={onOpen}>Veure la convocatòria</button>
      </div>
    </section>
  );
}

/** «Les d'avui»: les cares de les convocades, una mica superposades. Toca per veure la convocatòria. */
function CalledFaces({ cid, onOpen }: { cid: string; onOpen: () => void }) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [faces, setFaces] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    fetchRoster(cid).then((r) => alive && setRows(r.filter((x) => x.called).sort((a, b) => (a.dorsal ?? 99) - (b.dorsal ?? 99))), () => {});
    fetchAvatars().then((m) => alive && setFaces(m), () => {});
    return () => { alive = false; };
  }, [cid]);
  if (!rows.length) return null;
  const MAX = 9;
  const shown = rows.slice(0, MAX);
  return (
    <button type="button" className="md-faces" onClick={onOpen} aria-label={`Les ${rows.length} convocades d'avui. Veure la convocatòria`}>
      <span className="md-faces-k">Les d&apos;avui · {rows.length}</span>
      <span className="md-faces-row" aria-hidden="true">
        {shown.map((r, i) => (
          <span key={r.player_id} className={`md-face${faces.has(r.player_id) ? "" : " num"}`} style={{ animationDelay: `${0.25 + i * 0.07}s`, zIndex: MAX - i }}>
            {faces.has(r.player_id) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={faces.get(r.player_id)} alt="" />
            ) : <b>{r.dorsal ?? "·"}</b>}
          </span>
        ))}
        {rows.length > MAX && <span className="md-face more" style={{ animationDelay: `${0.25 + MAX * 0.07}s` }}>+{rows.length - MAX}</span>}
      </span>
    </button>
  );
}

const RES = { G: { k: "Victòria!", cls: "win" }, E: { k: "Empat", cls: "draw" }, P: { k: "Derrota", cls: "loss" } } as const;

/** Resultat oficial del darrer partit (dels últims dos dies). Si hem guanyat, confeti (un cop per partit). */
export function ResultCard({ today }: { today: string }) {
  const [r, setR] = useState<FcfResult | null>(null);
  const [party, setParty] = useState(false);
  useEffect(() => {
    let alive = true;
    recentResult(today).then((x) => {
      if (!alive || !x) return;
      setR(x);
      if (outcome(x) !== "G") return;
      const key = `confeti:${x.acta_id}`;
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch { /* sense emmagatzematge: el confeti surt igualment */ }
      setParty(true);
    }, () => {});
    return () => { alive = false; };
  }, [today]);
  if (!r) return null;
  const o = RES[outcome(r)];
  const home = prettyTeam(r.home), away = prettyTeam(r.away);
  return (
    <>
      {party && <Confetti onDone={() => setParty(false)} />}
      <button type="button" className={`result-card ${o.cls}`} onClick={() => setParty(outcome(r) === "G")} aria-label={`${o.k} ${home} ${r.home_goals} ${away} ${r.away_goals}`}>
        <span className="rc-k">Resultat final · {o.k}</span>
        <span className="rc-line">
          <span className={r.is_home ? "us" : ""}><Crest name={home} size={40} /><b>{home}</b></span>
          <strong>{r.home_goals}<i>–</i>{r.away_goals}</strong>
          <span className={r.is_home ? "" : "us"}><Crest name={away} size={40} /><b>{away}</b></span>
        </span>
        {outcome(r) === "G" && <span className="rc-more">Toca per tornar a celebrar-ho 🎉</span>}
      </button>
      <ResultStoryButton r={r} />
    </>
  );
}
