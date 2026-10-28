"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Confetti } from "@/components/matchday";
import { fetchMonthWrap, ofMonth, type MonthWrap } from "@/lib/month-wrap";

const SLIDE_MS = 5500;

/** Número que puja des de 0 (en mig segon) quan apareix la diapositiva. */
function CountUp({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    // Amb «menys moviment», arriba al número de cop.
    const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 700;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v.toFixed(decimals).replace(".", ",")}</>;
}

type Slide = { key: string; cls: string; body: ReactNode; party?: boolean };

function slidesOf(w: MonthWrap, name: string): Slide[] {
  const out: Slide[] = [];
  const first = name.trim().split(/\s+/)[0];
  out.push({
    key: "intro", cls: "s-intro", body: (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mw-crest" src="/escut.png" alt="" width={96} height={96} />
        <span className="mw-k">Juvenil C · CE Europa</span>
        <h2 className="mw-big">El teu<br />{w.name}</h2>
        <p className="mw-p">{first}, mira com t&apos;ha anat el mes 👀</p>
      </>
    ),
  });
  if (w.trainings.marked > 0) {
    const pct = Math.round((w.trainings.present / w.trainings.marked) * 100);
    out.push({
      key: "ent", cls: "s-ent", body: (
        <>
          <span className="mw-k">🏃‍♀️ Entrenaments</span>
          <div className="mw-ring" style={{ "--p": pct } as CSSProperties}><b><CountUp to={pct} />%</b></div>
          <p className="mw-p">Has vingut a <b>{w.trainings.present}</b> de <b>{w.trainings.marked}</b> entrenaments.</p>
          <p className="mw-s">{pct >= 90 ? "Impecable! 👏" : pct >= 75 ? "Molt bé, constància!" : "El mes que ve, a per més!"}</p>
        </>
      ),
    });
  }
  out.push({
    key: "well", cls: "s-well", body: (
      <>
        <span className="mw-k">📝 Wellness</span>
        <h2 className="mw-num"><CountUp to={w.wellness.count} /></h2>
        <p className="mw-p">qüestionaris omplerts</p>
        <div className="mw-pills">
          <span>🔥 Millor ratxa: <b>{w.wellness.best}</b></span>
          {w.wellness.avg != null && <span>💙 Mitjana: <b>{w.wellness.avg.toFixed(1).replace(".", ",")}</b></span>}
        </div>
      </>
    ),
  });
  if (w.effort.minutes > 0) {
    out.push({
      key: "esf", cls: "s-esf", body: (
        <>
          <span className="mw-k">💪 Esforç</span>
          <h2 className="mw-num"><CountUp to={w.effort.minutes} /></h2>
          <p className="mw-p">minuts entrenant i jugant</p>
          {w.effort.avgRpe != null && <p className="mw-s">Esforç mitjà: <b>{w.effort.avgRpe.toFixed(1).replace(".", ",")}</b> de 10</p>}
        </>
      ),
    });
  }
  if (w.matches.convos > 0 || w.matches.played > 0) {
    out.push({
      key: "par", cls: "s-par", party: w.matches.goals > 0, body: (
        <>
          <span className="mw-k">⚽ Partits</span>
          <div className="mw-trio">
            <div><b><CountUp to={w.matches.called} /></b><small>convocada</small></div>
            <div><b><CountUp to={w.matches.played} /></b><small>jugats</small></div>
            <div className={w.matches.goals ? "gold" : ""}><b><CountUp to={w.matches.goals} /></b><small>{w.matches.goals === 1 ? "gol" : "gols"}</small></div>
          </div>
          <p className="mw-s">{w.matches.goals > 0 ? "Golejadora! 🎯" : "Cada partit compta 💙"}</p>
        </>
      ),
    });
  }
  if (w.league) {
    out.push({
      key: "lli", cls: "s-lli", party: w.league.rank === 1, body: (
        <>
          <span className="mw-k">🏆 Lliga interna</span>
          {w.league.rank != null ? (
            <>
              <h2 className="mw-num">#<CountUp to={w.league.rank} /></h2>
              <p className="mw-p">de {w.league.of} classificades · {w.league.points} punts</p>
              <p className="mw-s">{w.league.rank === 1 ? "Campiona del mes! 🥇" : w.league.rank <= 3 ? "Al podi! 🥉" : "A pel podi el mes que ve!"}</p>
            </>
          ) : (
            <>
              <h2 className="mw-num"><CountUp to={w.league.points} /></h2>
              <p className="mw-p">punts en {w.league.trainings} entrenaments</p>
              <p className="mw-s">En calen {w.league.min} per classificar-se</p>
            </>
          )}
        </>
      ),
    });
  }
  out.push({
    key: "fi", cls: "s-fi", body: (
      <>
        <span className="mw-k">Gràcies per l&apos;esforç</span>
        <h2 className="mw-big">A per<br />{w.next}! 💙</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mw-crest" src="/escut.png" alt="" width={72} height={72} />
      </>
    ),
  });
  return out;
}

/** Les diapositives a pantalla completa (com les stories): toca a la dreta per avançar i a l'esquerra per tornar. */
export function MonthStories({ meId, name, day, today, onClose }: { meId: string; name: string; day: string; today: string; onClose: () => void }) {
  const [w, setW] = useState<MonthWrap | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [party, setParty] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetchMonthWrap(meId, day, today).then(setW, (e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [meId, day, today]);

  const slides = w ? slidesOf(w, name) : [];
  const n = slides.length;
  const next = useCallback(() => setI((x) => (x + 1 < n ? x + 1 : x)), [n]);
  const prev = () => setI((x) => Math.max(0, x - 1));
  const last = n > 0 && i === n - 1;

  // Avança sol; a l'última s'atura.
  useEffect(() => {
    if (!n || paused || last) return;
    const t = setTimeout(next, SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, n, paused, last, next]);

  // Confeti en entrar a una diapositiva de celebració (un cop per diapositiva).
  const isParty = !!slides[i]?.party;
  useEffect(() => {
    if (!isParty) return;
    const t = setTimeout(() => setParty(true), 300);
    return () => clearTimeout(t);
  }, [i, isParty]);

  useEffect(() => {
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener("keydown", onKey); };
  }, [onClose, next]);

  const s = slides[i];
  return (
    <div className={`mw ${s?.cls ?? "s-intro"}`} role="dialog" aria-modal="true" aria-label={w ? `El teu ${w.name}` : "El teu mes"}>
      {party && <Confetti onDone={() => setParty(false)} />}
      <div className="mw-bars" aria-hidden="true">
        {slides.map((x, k) => (
          <span key={x.key} className={k < i ? "done" : k === i ? (paused ? "now paused" : "now") : ""} style={{ animationDuration: `${SLIDE_MS}ms` }}><i /></span>
        ))}
      </div>
      <button ref={closeRef} type="button" className="mw-close" onClick={onClose} aria-label="Tancar">✕</button>
      {!w && !err && <div className="mw-slide"><span className="mw-k">Preparant el teu mes…</span></div>}
      {err && <div className="mw-slide"><p className="mw-p">No s&apos;ha pogut carregar: {err}</p></div>}
      {s && (
        <div
          key={s.key}
          className="mw-slide"
          onPointerDown={() => setPaused(true)}
          onPointerUp={(e) => {
            setPaused(false);
            const r = e.currentTarget.getBoundingClientRect();
            if (e.clientX - r.left < r.width * 0.3) prev(); else next();
          }}
          onPointerLeave={() => setPaused(false)}
        >
          {s.body}
          {last && <button type="button" className="btn mw-again" onClick={(e) => { e.stopPropagation(); setI(0); }} onPointerUp={(e) => e.stopPropagation()}>↺ Tornar-ho a veure</button>}
        </div>
      )}
      <span className="sr-only" aria-live="polite">{w ? `Diapositiva ${i + 1} de ${n}` : ""}</span>
    </div>
  );
}

/** A l'inici, els primers 7 dies del mes: l'accés al resum del mes anterior. */
export function MonthWrapBanner({ meId, name, today }: { meId: string; name: string; today: string }) {
  const [open, setOpen] = useState(false);
  const day = Number(today.slice(8, 10));
  if (day > 7) return null;
  const prevMonth = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
  const prev = prevMonth.toISOString().slice(0, 10);
  return (
    <>
      <button type="button" className="mw-banner" onClick={() => setOpen(true)}>
        <span className="mw-banner-k">🎬 Ja el tens aquí</span>
        <b>El teu mes {ofMonth(prev)}</b>
        <span>Entrenaments, wellness, partits i lliga ›</span>
      </button>
      {open && <MonthStories meId={meId} name={name} day={prev} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}
