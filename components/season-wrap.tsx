"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CountUp, Stories, type Slide } from "@/components/month-wrap";
import { shareOrDownload } from "@/lib/convo-story";
import { fetchActionCutout } from "@/lib/player-photos";
import { drawSeasonStory } from "@/lib/season-story";
import { fetchSeasonWrap, type SeasonWrap } from "@/lib/season-wrap";

/** Les diapositives de la temporada (funció pura: es pot ensenyar amb dades d'exemple). */
export function seasonSlides(w: SeasonWrap, name: string, cutout: string | null): Slide[] {
  const first = name.trim().split(/\s+/)[0];
  const out: Slide[] = [];
  out.push({ key: "intro", cls: `s-intro${cutout ? " has-photo" : ""}`, body: cutout ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="mw-photo" src={cutout} alt="" />
      <div className="mw-intro-text">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mw-crest small" src="/escut.png" alt="" width={56} height={56} />
        <span className="mw-k">Temporada {w.season}</span>
        <h2 className="mw-big">La teva<br />temporada</h2>
        <p className="mw-p">{first}, mira tot el que has fet aquest any 🎁</p>
      </div>
    </>
  ) : (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="mw-crest" src="/escut.png" alt="" width={96} height={96} />
      <span className="mw-k">Temporada {w.season}</span>
      <h2 className="mw-big">La teva<br />temporada</h2>
      <p className="mw-p">{first}, mira tot el que has fet aquest any 🎁</p>
    </>
  ) });
  if (w.trainings.marked) {
    const pct = Math.round((w.trainings.present / w.trainings.marked) * 100);
    out.push({ key: "ent", cls: "s-ent", body: (
      <>
        <span className="mw-k">🏃‍♀️ Entrenaments</span>
        <div className="mw-ring" style={{ "--p": pct } as CSSProperties}><b><CountUp to={pct} />%</b></div>
        <p className="mw-p">Has vingut a <b>{w.trainings.present}</b> de <b>{w.trainings.marked}</b> entrenaments.</p>
        {w.bestMonth && <p className="mw-s">El teu millor mes: <b>{w.bestMonth.name}</b> ({w.bestMonth.pct}%)</p>}
      </>
    ) });
  }
  out.push({ key: "well", cls: "s-well", body: (
    <>
      <span className="mw-k">📝 Wellness</span>
      <h2 className="mw-num"><CountUp to={w.wellness.count} /></h2>
      <p className="mw-p">qüestionaris en tota la temporada</p>
      <div className="mw-pills">
        <span>🔥 Millor ratxa: <b>{w.wellness.best}</b></span>
        {w.wellness.avg != null && <span>💙 Mitjana: <b>{w.wellness.avg.toFixed(1).replace(".", ",")}</b></span>}
      </div>
    </>
  ) });
  if (w.matches.played || w.matches.minutes) {
    out.push({ key: "min", cls: "s-esf", body: (
      <>
        <span className="mw-k">⏱️ Al camp</span>
        <h2 className="mw-num"><CountUp to={w.matches.minutes} /></h2>
        <p className="mw-p">minuts jugats en <b>{w.matches.played}</b> partits</p>
        {w.matches.starts > 0 && <p className="mw-s">{w.matches.starts} vegades de titular</p>}
      </>
    ) });
  }
  out.push({ key: "gols", cls: "s-par", party: w.matches.goals > 0 || w.mvps > 0, body: (
    <>
      <span className="mw-k">⚽ Gols i MVP</span>
      <div className="mw-trio">
        <div className={w.matches.goals ? "gold" : ""}><b><CountUp to={w.matches.goals} /></b><small>{w.matches.goals === 1 ? "gol" : "gols"}</small></div>
        <div className={w.mvps ? "gold" : ""}><b><CountUp to={w.mvps} /></b><small>{w.mvps === 1 ? "cop MVP" : "cops MVP"}</small></div>
      </div>
      <p className="mw-s">{w.mvps > 0 ? "Les companyes t'han triat 👑" : w.matches.goals > 0 ? "Golejadora! 🎯" : "Cada partit compta 💙"}</p>
    </>
  ) });
  out.push({ key: "fi", cls: "s-fi", body: (
    <>
      <span className="mw-k">Gràcies per aquesta temporada</span>
      <h2 className="mw-big">Orgull<br />d&apos;Europa 💙</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="mw-crest" src="/escut.png" alt="" width={72} height={72} />
    </>
  ) });
  return out;
}

export function SeasonStories({ meId, name, today, onClose, data }: { meId: string; name: string; today: string; onClose: () => void; data?: SeasonWrap }) {
  const [w, setW] = useState<SeasonWrap | null>(data ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [cutout, setCutout] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) return;
    fetchSeasonWrap(meId, today).then(setW, (e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [meId, today, data]);
  useEffect(() => {
    if (data) return;
    let alive = true;
    fetchActionCutout(meId).then((x) => alive && setCutout(x), () => {});
    return () => { alive = false; };
  }, [meId, data]);
  async function share() {
    if (!w || busy) return;
    setBusy(true);
    try { await shareOrDownload(await drawSeasonStory(w, name), `temporada-${w.season.replace("/", "-")}.png`); } catch { /* cancel·lat */ }
    setBusy(false);
  }
  return (
    <Stories slides={w ? seasonSlides(w, name, cutout) : null} label="La teva temporada" loading="Preparant la teva temporada…" err={err} onClose={onClose}
      footer={<button type="button" className="btn mw-share" disabled={busy} onClick={(e) => { e.stopPropagation(); void share(); }} onPointerUp={(e) => e.stopPropagation()}>{busy ? "Preparant…" : "📸 Compartir a Instagram"}</button>} />
  );
}

/** Botó: al cromo sempre («fins ara») i a l'inici els mesos de final de temporada (juny i juliol). */
export function SeasonWrapButton({ meId, name, today, home = false }: { meId: string; name: string; today: string; home?: boolean }) {
  const [open, setOpen] = useState(false);
  const m = Number(today.slice(5, 7));
  if (home && m !== 6 && m !== 7) return null;
  return (
    <>
      <button type="button" className="mw-banner season" onClick={() => setOpen(true)}>
        <span className="mw-banner-k">🎁 {home ? "Ja la tens aquí" : "Fins ara"}</span>
        <b>La teva temporada</b>
        <span>Entrenaments, minuts, gols, ratxa i MVP ›</span>
      </button>
      {open && <SeasonStories meId={meId} name={name} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}
