"use client";

import { useState } from "react";
import { PERIODS, type TeamStat } from "@/lib/bigdata";

// Colors validats (nosaltres / equip triat) i context en gris.
export const C_US = "#2f5bd3";
export const C_SEL = "#b07d1e";
const C_CTX = "#c3c9d8";
const INK = "#0b1846";
const MUTED = "#5a6485";
const GRID = "#e6e9f2";

/** Atac (gols a favor per partit) contra defensa (gols en contra per partit), amb els escuts. */
export function AttackDefense({ teams, usId, selId, onPick }: { teams: TeamStat[]; usId?: string; selId?: string | null; onPick?: (id: string) => void }) {
  const ts = teams.filter((t) => t.pj);
  const W = 640, H = 400, L = 46, R = 16, T = 18, B = 40;
  const gf = ts.map((t) => t.gf / t.pj), gc = ts.map((t) => t.gc / t.pj);
  const maxX = Math.max(1, ...gf) * 1.1, maxY = Math.max(1, ...gc) * 1.1;
  const x = (v: number) => L + (v / maxX) * (W - L - R);
  const y = (v: number) => T + (v / maxY) * (H - T - B); // amunt = encaixa poc
  const ax = gf.reduce((a, b) => a + b, 0) / (gf.length || 1), ay = gc.reduce((a, b) => a + b, 0) / (gc.length || 1);
  const [hover, setHover] = useState<TeamStat | null>(null);
  return (
    <figure className="bd-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Atac contra defensa de tots els equips">
        {[0, 0.25, 0.5, 0.75, 1].map((k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={T + k * (H - T - B)} y2={T + k * (H - T - B)} stroke={GRID} />
            <text x={L - 6} y={T + k * (H - T - B) + 4} textAnchor="end" fontSize={11} fill={MUTED}>{(k * maxY).toFixed(1)}</text>
            <text x={L + k * (W - L - R)} y={H - B + 16} textAnchor="middle" fontSize={11} fill={MUTED}>{(k * maxX).toFixed(1)}</text>
          </g>
        ))}
        <line x1={x(ax)} x2={x(ax)} y1={T} y2={H - B} stroke={MUTED} strokeDasharray="4 4" />
        <line x1={L} x2={W - R} y1={y(ay)} y2={y(ay)} stroke={MUTED} strokeDasharray="4 4" />
        <text x={W - R} y={T + 12} textAnchor="end" fontSize={11} fill={MUTED} fontWeight={700}>MARQUEN MOLT · ENCAIXEN POC</text>
        <text x={L + 4} y={H - B - 6} fontSize={11} fill={MUTED} fontWeight={700}>MARQUEN POC · ENCAIXEN MOLT</text>
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill={INK}>Gols a favor per partit →</text>
        <text x={14} y={(T + H - B) / 2} textAnchor="middle" fontSize={12} fill={INK} transform={`rotate(-90 14 ${(T + H - B) / 2})`}>← Gols en contra per partit</text>
        {ts.map((t, i) => {
          const cx = x(gf[i]), cy = y(gc[i]);
          const ring = t.id === usId ? C_US : t.id === selId ? C_SEL : null;
          return (
            <g key={t.id} style={{ cursor: onPick ? "pointer" : undefined }} onMouseEnter={() => setHover(t)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(t.id)}>
              <circle cx={cx} cy={cy} r={18} fill="transparent" />
              {ring && <circle cx={cx} cy={cy} r={16} fill="#fff" stroke={ring} strokeWidth={3} />}
              {t.crest ? <image href={t.crest} x={cx - 12} y={cy - 12} width={24} height={24} /> : <circle cx={cx} cy={cy} r={8} fill={C_CTX} />}
              <title>{`${t.name}: ${gf[i].toFixed(2)} a favor i ${gc[i].toFixed(2)} en contra per partit`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="bd-tip">{hover ? `${hover.name} · ${(hover.gf / hover.pj).toFixed(2)} a favor · ${(hover.gc / hover.pj).toFixed(2)} en contra per partit` : "Passa per sobre (o toca) un escut. Les línies discontínues són la mitjana de la lliga."}</figcaption>
    </figure>
  );
}

/** Evolució de la posició jornada a jornada (nosaltres en blau, l'equip triat en ocre, la resta en gris). */
export function PositionRace({ teams, usId, selId }: { teams: TeamStat[]; usId?: string; selId?: string | null }) {
  const js = [...new Set(teams.flatMap((t) => t.posHistory.map((p) => p.j)))].sort((a, b) => a - b);
  const n = teams.length;
  const W = 640, H = 340, L = 30, R = 120, T = 14, B = 30;
  const x = (j: number) => (js.length <= 1 ? (L + W - R) / 2 : L + ((js.indexOf(j)) / (js.length - 1)) * (W - L - R));
  const y = (pos: number) => T + ((pos - 1) / Math.max(1, n - 1)) * (H - T - B);
  const order = [...teams].sort((a, b) => Number(a.id === usId || a.id === selId) - Number(b.id === usId || b.id === selId));
  return (
    <figure className="bd-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolució de la posició a la classificació">
        {Array.from({ length: n }, (_, i) => i + 1).filter((p) => p === 1 || p % 3 === 0 || p === n).map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke={GRID} />
            <text x={L - 8} y={y(p) + 4} textAnchor="end" fontSize={11} fill={MUTED}>{p}</text>
          </g>
        ))}
        {js.map((j) => <text key={j} x={x(j)} y={H - 8} textAnchor="middle" fontSize={11} fill={MUTED}>J{j}</text>)}
        {order.map((t) => {
          const c = t.id === usId ? C_US : t.id === selId ? C_SEL : C_CTX;
          const strong = c !== C_CTX;
          const pts = t.posHistory.map((p) => `${x(p.j)},${y(p.pos)}`).join(" ");
          const last = t.posHistory[t.posHistory.length - 1];
          return (
            <g key={t.id}>
              <polyline points={pts} fill="none" stroke={c} strokeWidth={strong ? 3 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
              {t.posHistory.map((p) => (
                <circle key={p.j} cx={x(p.j)} cy={y(p.pos)} r={strong ? 5 : 3} fill={c} stroke="#fff" strokeWidth={2}>
                  <title>{`${t.name} · J${p.j}: ${p.pos}a`}</title>
                </circle>
              ))}
              {last && strong && <text x={W - R + 8} y={y(last.pos) + 4} fontSize={12} fontWeight={700} fill={INK}>{t.name.slice(0, 16)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="bd-legend"><i style={{ background: C_US }} /> Nosaltres {selId && selId !== usId && <><i style={{ background: C_SEL }} /> Equip triat</>} <i style={{ background: C_CTX }} /> Resta</figcaption>
    </figure>
  );
}

/** Gols per franja de 15': dues sèries (p. ex. nosaltres i la mitjana de la lliga). */
export function PeriodBars({ a, b, la, lb, unit = "per partit" }: { a: number[]; b: number[]; la: string; lb: string; unit?: string }) {
  const W = 640, H = 230, L = 34, R = 10, T = 12, B = 30;
  const max = Math.max(0.5, ...a, ...b) * 1.15;
  const gw = (W - L - R) / 6;
  const bw = Math.min(26, gw / 2 - 6);
  const y = (v: number) => H - B - (v / max) * (H - T - B);
  return (
    <figure className="bd-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gols per franja: ${la} i ${lb}`}>
        {[0, 0.5, 1].map((k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(k * max)} y2={y(k * max)} stroke={GRID} />
            <text x={L - 6} y={y(k * max) + 4} textAnchor="end" fontSize={11} fill={MUTED}>{(k * max).toFixed(1)}</text>
          </g>
        ))}
        {PERIODS.map((p, i) => {
          const cx = L + gw * i + gw / 2;
          return (
            <g key={p}>
              {([[a[i], C_US, la, -1], [b[i], C_CTX, lb, 1]] as const).map(([v, c, lab, side]) => {
                const x0 = cx + (side < 0 ? -bw - 1 : 1);
                const h = Math.max(0, H - B - y(v));
                return (
                  <g key={lab}>
                    <rect x={x0} y={y(v)} width={bw} height={h} rx={Math.min(4, h / 2)} fill={c}><title>{`${lab} · ${p}: ${v.toFixed(2)} ${unit}`}</title></rect>
                  </g>
                );
              })}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} fill={MUTED}>{p}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="bd-legend"><i style={{ background: C_US }} /> {la} <i style={{ background: C_CTX }} /> {lb}</figcaption>
    </figure>
  );
}

/** Gols a favor (amunt) i en contra (avall) per franja d'un equip. */
export function MirrorBars({ forBy, againstBy }: { forBy: number[]; againstBy: number[] }) {
  const W = 640, H = 240, L = 34, R = 10, T = 10, B = 26;
  const max = Math.max(1, ...forBy, ...againstBy);
  const mid = (T + H - B) / 2;
  const half = (H - T - B) / 2 - 4;
  const gw = (W - L - R) / 6, bw = Math.min(34, gw - 16);
  return (
    <figure className="bd-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gols a favor i en contra per franja de 15 minuts">
        <line x1={L} x2={W - R} y1={mid} y2={mid} stroke={MUTED} />
        {PERIODS.map((p, i) => {
          const cx = L + gw * i + gw / 2;
          const hf = (forBy[i] / max) * half, ha = (againstBy[i] / max) * half;
          return (
            <g key={p}>
              <rect x={cx - bw / 2} y={mid - hf - 1} width={bw} height={hf} rx={Math.min(4, hf / 2)} fill={C_US}><title>{`${p}: ${forBy[i]} a favor`}</title></rect>
              <rect x={cx - bw / 2} y={mid + 1} width={bw} height={ha} rx={Math.min(4, ha / 2)} fill={C_SEL}><title>{`${p}: ${againstBy[i]} en contra`}</title></rect>
              {forBy[i] > 0 && <text x={cx} y={mid - hf - 5} textAnchor="middle" fontSize={11} fill={INK}>{forBy[i]}</text>}
              {againstBy[i] > 0 && <text x={cx} y={mid + ha + 14} textAnchor="middle" fontSize={11} fill={INK}>{againstBy[i]}</text>}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill={MUTED}>{p}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="bd-legend"><i style={{ background: C_US }} /> A favor <i style={{ background: C_SEL }} /> En contra</figcaption>
    </figure>
  );
}

export function FormStrip({ form }: { form: ("G" | "E" | "P")[] }) {
  return (
    <span className="bd-form" aria-label={`Ratxa: ${form.join(" ")}`}>
      {form.map((f, i) => <i key={i} className={`rbadge ${f}`}>{f}</i>)}
    </span>
  );
}
