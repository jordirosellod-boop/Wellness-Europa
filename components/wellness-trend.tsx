"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

type Pt = { day: string; score: number };
const dm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;

/** Gràfic pur: la línia del wellness (1-10) amb degradat daurat a sota, l'últim punt que brilla i el valor en tocar. */
export function TrendChart({ points }: { points: Pt[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 320, H = 120, P = 12;
  const xs = (i: number) => (points.length <= 1 ? W / 2 : P + (i / (points.length - 1)) * (W - 2 * P));
  // Escala ajustada als valors (amb marge), perquè es vegin bé les pujades i baixades
  const vals = points.map((q) => q.score);
  const lo = Math.max(1, Math.floor(Math.min(...vals, 10)) - 1), hi = Math.min(10, Math.ceil(Math.max(...vals, 1)) + 1);
  const ys = (v: number) => P + 14 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 2 * P - 18);
  // Corba suau (Catmull-Rom → Bézier)
  const d = useMemo(() => {
    const p = points.map((q, i) => [xs(i), ys(q.score)] as const);
    if (!p.length) return "";
    let s = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2;
      s += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);
  if (!points.length) return null;
  const last = points.length - 1;
  const area = `${d} L${xs(last)},${H - 4} L${xs(0)},${H - 4} Z`;
  const show = sel ?? last;
  return (
    <svg className="wt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Wellness dels últims ${points.length} dies: l'últim, ${points[last].score}`}>
      <defs>
        <linearGradient id="wt-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dbb34d" stopOpacity=".45" /><stop offset="1" stopColor="#dbb34d" stopOpacity="0" /></linearGradient>
        <filter id="wt-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      {[lo, (lo + hi) / 2, hi].map((v) => <line key={v} x1={P} x2={W - P} y1={ys(v)} y2={ys(v)} stroke="currentColor" strokeOpacity=".12" strokeDasharray="3 4" />)}
      <path className="wt-area" d={area} fill="url(#wt-area)" />
      <path className="wt-line" d={d} fill="none" stroke="#dbb34d" strokeWidth={3} strokeLinecap="round" pathLength={1} />
      {points.map((q, i) => (
        <circle key={q.day} cx={xs(i)} cy={ys(q.score)} r={i === show ? 5 : 3} fill={i === show ? "#f6d77a" : "#dbb34d"} stroke="#0b1846" strokeWidth={1.5}
          onClick={() => setSel(i)} onPointerEnter={() => setSel(i)} style={{ cursor: "pointer" }} />
      ))}
      <circle className="wt-glow" cx={xs(last)} cy={ys(points[last].score)} r={9} fill="#f6d77a" filter="url(#wt-glow)" />
      <g transform={`translate(${Math.min(W - 44, Math.max(44, xs(show)))} ${Math.max(16, ys(points[show].score) - 14)})`} pointerEvents="none">
        <rect x={-40} y={-15} width={80} height={20} rx={10} fill="#0b1846" stroke="#dbb34d" />
        <text x={0} y={-1} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{dm(points[show].day)} · {String(points[show].score).replace(".", ",")}</text>
      </g>
    </svg>
  );
}

/** Jugadora: el seu wellness dels últims dies, en una targeta. */
export function WellnessTrend({ meId, today }: { meId: string; today: string }) {
  const [pts, setPts] = useState<Pt[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase().from("wellness").select("score, sessions!inner(session_date)").eq("player_id", meId).gte("sessions.session_date", addDays(today, -30)).lte("sessions.session_date", today).limit(60)
      .then(({ data }) => {
        if (!alive) return;
        const rows = ((data ?? []) as unknown as { score: number; sessions: { session_date: string } | { session_date: string }[] }[])
          .map((r) => ({ day: (Array.isArray(r.sessions) ? r.sessions[0] : r.sessions)?.session_date ?? "", score: Number(r.score) }))
          .filter((r) => r.day).sort((a, b) => a.day.localeCompare(b.day));
        // un punt per dia (la mitjana si n'hi ha més d'un)
        const by = new Map<string, number[]>();
        for (const r of rows) by.set(r.day, [...(by.get(r.day) ?? []), r.score]);
        setPts([...by.entries()].map(([day, v]) => ({ day, score: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 })).slice(-14));
      }, () => alive && setPts([]));
    return () => { alive = false; };
  }, [meId, today]);
  if (!pts || pts.length < 3) return null;
  const avg = pts.reduce((a, p) => a + p.score, 0) / pts.length;
  const half = Math.floor(pts.length / 2);
  const a1 = pts.slice(0, half).reduce((a, p) => a + p.score, 0) / half, a2 = pts.slice(half).reduce((a, p) => a + p.score, 0) / (pts.length - half);
  const trend = a2 - a1 > 0.4 ? "↗ Pujant" : a1 - a2 > 0.4 ? "↘ Baixant" : "→ Estable";
  return (
    <section className="card wt-card" aria-label="El teu wellness">
      <div className="wt-head"><b>💙 El teu wellness</b><span className={`wt-trend ${trend.startsWith("↗") ? "up" : trend.startsWith("↘") ? "down" : ""}`}>{trend}</span></div>
      <TrendChart points={pts} />
      <p className="wt-foot">Mitjana dels últims {pts.length} dies: <b>{avg.toFixed(1).replace(".", ",")}</b></p>
    </section>
  );
}
