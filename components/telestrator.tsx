"use client";

import { useRef, useState, type PointerEvent as RPointerEvent } from "react";

// Dibuix sobre el vídeo (pissarra): coordenades 0-100 en tots dos eixos, relatives al vídeo.
export type Shape = { k: "arrow" | "line" | "circle" | "rect" | "free"; c: string; pts: [number, number][] };

export const DRAW_COLORS = ["#ffd400", "#ff3b30", "#ffffff", "#2f7bff", "#34c759"];

function ShapeView({ s, id }: { s: Shape; id: string }) {
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  const common = { stroke: s.c, strokeWidth: 0.7, fill: "none", vectorEffect: "non-scaling-stroke" as const, strokeLinecap: "round" as const };
  switch (s.k) {
    case "arrow":
      return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} strokeWidth={4} markerEnd={`url(#${id}-${s.c.slice(1)})`} />;
    case "line":
      return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} strokeWidth={4} strokeDasharray="10 8" />;
    case "circle":
      return <ellipse cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.abs(b[0] - a[0]) / 2} ry={Math.abs(b[1] - a[1]) / 2} {...common} strokeWidth={4} />;
    case "rect":
      return <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} {...common} strokeWidth={3} fill={s.c} fillOpacity={0.22} />;
    case "free":
      return <polyline points={s.pts.map((p) => p.join(",")).join(" ")} {...common} strokeWidth={4} strokeLinejoin="round" />;
  }
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      {DRAW_COLORS.map((c) => (
        <marker key={c} id={`${id}-${c.slice(1)}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={c} />
        </marker>
      ))}
    </defs>
  );
}

/** Capa per mostrar un dibuix desat a sobre del vídeo. */
export function DrawingOverlay({ shapes }: { shapes: Shape[] }) {
  return (
    <svg className="tele" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <Defs id="tv" />
      {shapes.map((s, i) => <ShapeView key={i} s={s} id="tv" />)}
    </svg>
  );
}

/** Editor del dibuix a sobre del vídeo (amb el vídeo aturat). */
export function DrawingEditor({ initial, onSave, onCancel }: { initial: Shape[]; onSave: (s: Shape[]) => void; onCancel: () => void }) {
  const [shapes, setShapes] = useState<Shape[]>(initial);
  const [tool, setTool] = useState<Shape["k"]>("arrow");
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const pt = (e: RPointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10];
  };

  return (
    <>
      <svg
        ref={svg}
        className="tele editing"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        onPointerDown={(e) => {
          svg.current!.setPointerCapture(e.pointerId);
          const p = pt(e);
          setDraft({ k: tool, c: color, pts: [p, p] });
        }}
        onPointerMove={(e) => {
          if (!draft) return;
          const p = pt(e);
          setDraft(draft.k === "free" ? { ...draft, pts: [...draft.pts, p] } : { ...draft, pts: [draft.pts[0], p] });
        }}
        onPointerUp={() => {
          if (draft) {
            const [a, b] = [draft.pts[0], draft.pts[draft.pts.length - 1]];
            if (draft.k === "free" ? draft.pts.length > 3 : Math.hypot(b[0] - a[0], b[1] - a[1]) > 1.5) setShapes((s) => [...s, draft]);
          }
          setDraft(null);
        }}
      >
        <Defs id="te" />
        {shapes.map((s, i) => <ShapeView key={i} s={s} id="te" />)}
        {draft && <ShapeView s={draft} id="te" />}
      </svg>
      <div className="tele-tools">
        {([["arrow", "➜"], ["line", "┄"], ["circle", "◯"], ["rect", "▭"], ["free", "✎"]] as [Shape["k"], string][]).map(([k, ic]) => (
          <button key={k} type="button" aria-pressed={tool === k} onClick={() => setTool(k)} title={k}>{ic}</button>
        ))}
        <span className="sep" />
        {DRAW_COLORS.map((c) => (
          <button key={c} type="button" className="col" aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
        ))}
        <span className="sep" />
        <button type="button" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}>↶</button>
        <button type="button" onClick={() => setShapes([])} disabled={!shapes.length}>Netejar</button>
        <button type="button" className="ok" onClick={() => onSave(shapes)}>Desar dibuix</button>
        <button type="button" onClick={onCancel}>Cancel·lar</button>
      </div>
    </>
  );
}
