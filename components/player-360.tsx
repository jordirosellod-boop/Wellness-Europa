"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CountUp } from "@/components/count-up";
import { acwrBand } from "@/lib/acwr";
import { addDays } from "@/lib/dates";
import { watchList, type Player360 } from "@/lib/player360";

const LV: Record<string, { t: string; c: string }> = {
  red: { t: "Vigilar", c: "#d93025" }, yellow: { t: "Atenció", c: "#e6a100" }, green: { t: "Bé", c: "#1e8e3e" }, none: { t: "Pendent", c: "#8a93ad" }, away: { t: "No ve", c: "#8a93ad" },
};
const dm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const n1 = (x: number) => x.toFixed(1).replace(".", ",");
type Key = "score" | "sleep" | "fatigue" | "mood";
const SERIES: { k: Key; label: string; color: string }[] = [
  { k: "score", label: "Global", color: "#dbb34d" }, { k: "sleep", label: "Son", color: "#7aa7ff" }, { k: "fatigue", label: "Energia", color: "#5fd3a6" }, { k: "mood", label: "Ànim", color: "#ff9ec4" },
];

/** Wellness dels últims 30 dies: les línies triades i la mitjana de l'equip (discontínua). */
function WellChart({ p, today }: { p: Player360; today: string }) {
  const [on, setOn] = useState<Set<Key>>(new Set(["score"]));
  const [sel, setSel] = useState<number | null>(null);
  const W = 640, H = 220, L = 28, R = 12, T = 14, B = 26;
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => addDays(today, i - 30)), [today]);
  const x = (d: string) => L + (days.indexOf(d) / 30) * (W - L - R);
  const pts = p.well;
  // Escala ajustada a les dades (amb marge), perquè es vegin les pujades i baixades
  const all = pts.flatMap((w) => SERIES.filter((x2) => on.has(x2.k)).map((x2) => w[x2.k])).concat([...p.teamAvg.values()]);
  const lo = Math.max(1, Math.floor(Math.min(...all, 10)) - 1), hi = Math.min(10, Math.ceil(Math.max(...all, 1)) + 1);
  const y = (v: number) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B);
  const path = (k: Key) => pts.map((w, i) => `${i ? "L" : "M"}${x(w.date)},${y(w[k])}`).join(" ");
  const team = days.filter((d) => p.teamAvg.has(d)).map((d, i) => `${i ? "L" : "M"}${x(d)},${y(p.teamAvg.get(d)!)}`).join(" ");
  const s = sel != null ? pts[sel] : pts[pts.length - 1];
  if (!pts.length) return <p className="muted small">Encara no hi ha wellness aquest mes.</p>;
  return (
    <>
      <div className="p3-chips" role="group" aria-label="Què es veu">
        {SERIES.map((x2) => (
          <button key={x2.k} type="button" className={on.has(x2.k) ? "on" : ""} style={{ "--c": x2.color } as CSSProperties} aria-pressed={on.has(x2.k)}
            onClick={() => setOn((o) => { const n = new Set(o); if (n.has(x2.k)) { if (n.size > 1) n.delete(x2.k); } else n.add(x2.k); return n; })}>{x2.label}</button>
        ))}
        <span className="p3-team"><i /> Mitjana de l&apos;equip</span>
      </div>
      <svg className="p3-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Wellness dels últims 30 dies">
        <defs>
          <linearGradient id="p3-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dbb34d" stopOpacity=".35" /><stop offset="1" stopColor="#dbb34d" stopOpacity="0" /></linearGradient>
        </defs>
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((v) => (hi - lo > 5 ? v % 2 === 0 : true)).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity=".1" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity=".5">{v}</text></g>)}
        {[0, 10, 20, 30].map((i) => <text key={i} x={x(days[i])} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" opacity=".5">{dm(days[i])}</text>)}
        <path d={team} fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="2" strokeDasharray="5 5" />
        {on.has("score") && pts.length > 1 && <path className="p3-area" d={`${path("score")} L${x(pts[pts.length - 1].date)},${H - B} L${x(pts[0].date)},${H - B} Z`} fill="url(#p3-area)" />}
        {SERIES.filter((x2) => on.has(x2.k)).map((x2) => <path key={x2.k} className="p3-line" d={path(x2.k)} fill="none" stroke={x2.color} strokeWidth={x2.k === "score" ? 3.5 : 2.5} strokeLinejoin="round" strokeLinecap="round" pathLength={1} />)}
        {pts.map((w, i) => (
          <g key={w.date} onClick={() => setSel(i)} onPointerEnter={() => setSel(i)} style={{ cursor: "pointer" }}>
            <rect x={x(w.date) - 8} y={T} width={16} height={H - T - B} fill="transparent" />
            {w.pain && <text x={x(w.date)} y={T + 8} textAnchor="middle" fontSize="11">🩹</text>}
            <circle cx={x(w.date)} cy={y(w.score)} r={s === w ? 6 : 3.5} fill={s === w ? "#f6d77a" : "#dbb34d"} stroke="#0b1846" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
      {s && (
        <div className="p3-day">
          <b>{dm(s.date)}</b>
          <span>Global <b>{n1(s.score)}</b></span><span>Son <b>{s.sleep}</b></span><span>Energia <b>{s.fatigue}</b></span><span>Ànim <b>{s.mood}</b></span>
          {s.pain && <span className="pain">🩹 Dolor</span>}
          {p.teamAvg.has(s.date) && <span className="muted">Equip {n1(p.teamAvg.get(s.date)!)}</span>}
        </div>
      )}
    </>
  );
}

/** L'ACWR com un rellotge: zona baixa, òptima, alerta i risc. */
function LoadGauge({ acwr, week, reliable }: { acwr: number | null; week: number; reliable: boolean }) {
  const lo = 0.4, hi = 2.0;
  const ang = (v: number) => Math.PI * (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo));
  const pt = (v: number, r: number) => [100 + r * Math.cos(ang(v)), 100 - r * Math.sin(ang(v))];
  const arc = (a: number, b: number, c: string) => { const [x1, y1] = pt(a, 80), [x2, y2] = pt(b, 80); return <path d={`M${x1},${y1} A80,80 0 0 1 ${x2},${y2}`} stroke={c} strokeWidth="16" fill="none" />; };
  const band = acwr != null ? acwrBand(acwr) : null;
  const [nx, ny] = acwr != null ? pt(acwr, 64) : [100, 36];
  return (
    <div className="p3-gauge">
      <svg viewBox="0 0 200 116" role="img" aria-label={acwr != null ? `ACWR ${n1(acwr)}` : "Sense dades de càrrega"}>
        {arc(lo, 0.8, "#9aa6c4")}{arc(0.8, 1.3, "#1e8e3e")}{arc(1.3, 1.5, "#e6a100")}{arc(1.5, hi, "#d93025")}
        {acwr != null && <line className="p3-needle" x1="100" y1="100" x2={nx} y2={ny} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />}
        <circle cx="100" cy="100" r="7" fill="currentColor" />
      </svg>
      <div className="p3-gauge-v">
        <b>{acwr != null ? <CountUp value={acwr} decimals={2} /> : "–"}</b>
        <span>{!reliable ? "Poques dades encara" : band ? band.label : ""}</span>
        <small>{Math.round(week)} UA aquesta setmana</small>
      </div>
    </div>
  );
}

export function Player360View({ p, today }: { p: Player360; today: string }) {
  const lv = LV[p.readiness.level] ?? LV.none;
  const watch = watchList(p, today);
  const pct = p.season.marked ? Math.round((p.season.present / p.season.marked) * 100) : null;
  const injuredNow = p.injuries.find((i) => i.start <= today && (!i.end || i.end >= today));
  const next = p.meetings.find((m) => !m.done && m.day >= today);
  const done = p.meetings.filter((m) => m.done).length;
  return (
    <div className="p3">
      <header className="p3-head">
        <span className="p3-num">{p.dorsal ?? "–"}</span>
        <div className="p3-who">
          <span className="p3-k">Fitxa 360° · Juvenil C</span>
          <h1>{p.name}</h1>
          <div className="p3-tags">
            <span className="p3-pill" style={{ "--c": lv.c } as CSSProperties}><i /> {lv.t}</span>
            {injuredNow && <span className="p3-pill" style={{ "--c": "#d93025" } as CSSProperties}>🩹 Lesionada des del {dm(injuredNow.start)}</span>}
            {p.season.mvps > 0 && <span className="p3-pill gold">👑 {p.season.mvps}× MVP</span>}
          </div>
          {p.readiness.reasons.length > 0 && <p className="p3-why">{p.readiness.reasons.join(" · ")}</p>}
        </div>
      </header>

      <section className={`p3-watch ${watch.level}`}>
        <span className="p3-k">{watch.level === "green" ? "✅ Què vigilar" : "👀 Què vigilar"}</span>
        <ul>{watch.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>

      <section className="p3-card dark">
        <div className="p3-card-h"><b>Wellness · últims 30 dies</b></div>
        <WellChart p={p} today={today} />
      </section>

      <div className="p3-grid">
        <section className="p3-card">
          <div className="p3-card-h"><b>Càrrega</b><small>ACWR</small></div>
          {p.load ? <LoadGauge acwr={p.load.acwr} week={p.load.week} reliable={p.load.reliable} /> : <p className="muted small">Encara no hi ha RPE per calcular-la.</p>}
        </section>
        <section className="p3-card">
          <div className="p3-card-h"><b>Assistència</b><small>temporada</small></div>
          <div className="p3-big">{pct != null ? <><CountUp value={pct} />%</> : "–"}</div>
          <p className="muted small" style={{ margin: "2px 0 8px" }}>{p.season.present} de {p.season.marked} entrenaments</p>
          <div className="p3-dots" aria-label="Últims entrenaments">{p.season.recent.map((r, i) => <i key={i} className={r === true ? "ok" : r === false ? "ko" : ""} title={r === true ? "Hi va venir" : r === false ? "No hi va venir" : "Sense passar llista"} />)}</div>
        </section>
      </div>

      <section className="p3-card">
        <div className="p3-card-h"><b>Temporada</b></div>
        <div className="p3-tiles">
          {([[p.season.minutes, "minuts"], [p.season.played, "partits"], [p.season.starts, "titular"], [p.season.goals, "gols"], [p.season.mvps, "MVP"]] as [number, string][]).map(([v, l]) => (
            <div key={l}><b><CountUp value={v} /></b><small>{l}</small></div>
          ))}
        </div>
      </section>

      <div className="p3-grid">
        <section className="p3-card">
          <div className="p3-card-h"><b>Lesions</b></div>
          {p.injuries.length ? (
            <ul className="p3-list">{p.injuries.slice(0, 4).map((i) => (
              <li key={i.start} className={!i.end || i.end >= today ? "now" : ""}><b>{dm(i.start)}{i.end ? ` – ${dm(i.end)}` : " – ara"}</b>{i.note && <span>{i.note}</span>}</li>
            ))}</ul>
          ) : <p className="muted small">Cap lesió aquesta temporada 💪</p>}
        </section>
        <section className="p3-card">
          <div className="p3-card-h"><b>Reunions</b></div>
          {next ? <p className="p3-next">Propera: <b>{dm(next.day)} a les {next.time}</b><span>{next.title}</span></p> : <p className="muted small">Cap reunió pendent.</p>}
          <p className="muted small" style={{ margin: 0 }}>{done} {done === 1 ? "feta" : "fetes"} aquesta temporada</p>
        </section>
      </div>
    </div>
  );
}
