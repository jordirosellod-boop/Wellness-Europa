"use client";

import { useId, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { uid, type ArrowKind, type Diagram, type El, type Field, type Team } from "@/lib/plan";

const W = 100;
const H = 64;
const TEAM_FILL: Record<Team, string> = { blue: "#1452c8", red: "#d32f2f", yellow: "#f2c200", white: "#ffffff", gk: "#111111" };
const TEAM_TEXT: Record<Team, string> = { blue: "#fff", red: "#fff", yellow: "#0b1846", white: "#0b1846", gk: "#f2c200" };
const ARROW: Record<ArrowKind, { color: string; dash?: string; label: string }> = {
  pass: { color: "#ffffff", label: "Passada" },
  drive: { color: "#ffffff", dash: "1.6 1.2", label: "Conducció" },
  run: { color: "#111111", label: "Desplaçament" },
  shot: { color: "#e53935", label: "Xut" },
};
/** Colors ràpids per a les fletxes (i qualsevol altre amb el selector). */
const ARROW_COLORS = ["#ffffff", "#111111", "#e53935", "#ffd400", "#1452c8", "#ff8f1f", "#7cff4f", "#ff4fa3", "#9b5cff"];
const HEX = /^#[0-9a-f]{6}$/i;
const arrowColor = (el: { kind: ArrowKind; c?: string }) => (el.c && HEX.test(el.c) ? el.c.toLowerCase() : ARROW[el.kind].color);
const markerKey = (el: { kind: ArrowKind; c?: string }) => (el.c && HEX.test(el.c) ? `c${el.c.slice(1).toLowerCase()}` : el.kind);
/** Orientació per defecte de les jugadores noves: cap a la porteria (amunt) al mig camp, cap a la dreta a la resta. */
const defaultHeading = (f: Field) => (f === "half" ? 0 : 90);

/** Gespa i línies del camp (sencer, mig camp amb la porteria a dalt, o només gespa). */
function FieldBg({ field }: { field: Field }) {
  const stripes = Array.from({ length: 10 }, (_, i) => (
    <rect key={i} x={0} y={(i * H) / 10} width={W} height={H / 10} fill={i % 2 ? "#2f9a42" : "#2a8a3b"} />
  ));
  const line = { fill: "none", stroke: "rgba(255,255,255,.9)", strokeWidth: 0.35 } as const;
  return (
    <g>
      {stripes}
      {field === "full" && (
        <g {...line}>
          <rect x={2} y={2} width={W - 4} height={H - 4} />
          <line x1={W / 2} y1={2} x2={W / 2} y2={H - 2} />
          <circle cx={W / 2} cy={H / 2} r={8.5} />
          <rect x={2} y={H / 2 - 18.5} width={15.5} height={37} />
          <rect x={W - 17.5} y={H / 2 - 18.5} width={15.5} height={37} />
          <rect x={2} y={H / 2 - 8.5} width={5.2} height={17} />
          <rect x={W - 7.2} y={H / 2 - 8.5} width={5.2} height={17} />
          <rect x={0.4} y={H / 2 - 3.4} width={1.6} height={6.8} />
          <rect x={W - 2} y={H / 2 - 3.4} width={1.6} height={6.8} />
        </g>
      )}
      {field === "half" && (
        <g {...line}>
          <rect x={2} y={2} width={W - 4} height={H - 2.5} />
          <rect x={W / 2 - 30} y={2} width={60} height={20} />
          <rect x={W / 2 - 13} y={2} width={26} height={7} />
          <rect x={W / 2 - 5.5} y={0.4} width={11} height={1.6} />
          <path d={`M${W / 2 - 9} 22 A11 11 0 0 0 ${W / 2 + 9} 22`} />
          <path d={`M${W / 2 - 12} ${H - 0.5} A12 12 0 0 1 ${W / 2 + 12} ${H - 0.5}`} />
          <circle cx={W / 2} cy={15} r={0.4} fill="rgba(255,255,255,.9)" />
        </g>
      )}
    </g>
  );
}

export const SIZE_MIN = 0.4;
export const SIZE_MAX = 3;

function ElView({ el, selected, arrowId, field }: { el: El; selected: boolean; arrowId: string; field: Field }) {
  const k = el.s ?? 1;
  // A les jugadores només es gira el dibuixet (la lletra queda dreta).
  const r = "r" in el && el.t !== "player" ? el.r ?? 0 : 0;
  if (el.t === "arrow" || (k === 1 && !r)) return <ElShape el={el} selected={selected} arrowId={arrowId} field={field} />;
  // Mida i orientació: des del centre de l'element.
  return (
    <g transform={`translate(${el.x} ${el.y}) rotate(${r}) scale(${k}) translate(${-el.x} ${-el.y})`}>
      <ElShape el={el} selected={selected} arrowId={arrowId} field={field} />
    </g>
  );
}

function ElShape({ el, selected, arrowId, field }: { el: El; selected: boolean; arrowId: string; field: Field }) {
  const sel = selected ? { stroke: "#dbb34d", strokeWidth: 0.7 } : {};
  switch (el.t) {
    case "player":
      return (
        <g>
          {/* Rodona i un parèntesi al costat cap on mira. */}
          <path
            transform={`rotate(${el.r ?? defaultHeading(field)} ${el.x} ${el.y})`}
            d={`M${el.x - 2.45} ${el.y - 2.3} A3.35 3.35 0 0 1 ${el.x + 2.45} ${el.y - 2.3}`}
            fill="none" stroke={selected ? "#dbb34d" : "#0b1846"} strokeWidth={0.6} strokeLinecap="round"
          />
          <circle cx={el.x} cy={el.y} r={2.4} fill={TEAM_FILL[el.team]} stroke="#0b1846" strokeWidth={0.35} {...sel} />
          {el.label && (
            <text x={el.x} y={el.y + 0.95} textAnchor="middle" fontSize={2.6} fill={TEAM_TEXT[el.team]} style={{ fontFamily: "var(--font-escapulada), var(--display)" }}>
              {el.label}
            </text>
          )}
        </g>
      );
    case "cone":
      return <path d={`M${el.x} ${el.y - 1.5} L${el.x + 1.3} ${el.y + 1} L${el.x - 1.3} ${el.y + 1} Z`} fill="#ff8f1f" stroke="#7a3d00" strokeWidth={0.2} {...sel} />;
    case "ball":
      return (
        <g>
          <circle cx={el.x} cy={el.y} r={1.1} fill="#fff" stroke="#111" strokeWidth={0.25} {...sel} />
          <circle cx={el.x} cy={el.y} r={0.4} fill="#111" />
        </g>
      );
    case "minigoal":
      return <rect x={el.x - 2.5} y={el.y - 0.8} width={5} height={1.6} fill="rgba(255,255,255,.35)" stroke="#fff" strokeWidth={0.35} {...sel} />;
    case "goal":
      return <rect x={el.x - 4} y={el.y - 1} width={8} height={2} fill="rgba(255,255,255,.35)" stroke="#fff" strokeWidth={0.45} {...sel} />;
    case "arrow": {
      const a = ARROW[el.kind];
      return (
        <line
          x1={el.x} y1={el.y} x2={el.x2} y2={el.y2}
          stroke={selected ? "#dbb34d" : arrowColor(el)} strokeWidth={0.45 * (el.s ?? 1)} strokeDasharray={a.dash?.split(" ").map((n) => Number(n) * (el.s ?? 1)).join(" ")}
          markerEnd={`url(#${arrowId}-${selected ? "sel" : markerKey(el)})`}
        />
      );
    }
  }
}

/** Dibuix de l'exercici (només per mirar o imprimir). */
export function DrillView({ d }: { d: Diagram }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="drill" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dibuix de l'exercici">
      <Markers id={id} els={d.els} />
      <FieldBg field={d.field} />
      {d.els.map((el) => <ElView key={el.id} el={el} selected={false} arrowId={id} field={d.field} />)}
    </svg>
  );
}

function Markers({ id, els }: { id: string; els: El[] }) {
  const m = (key: string, color: string) => (
    <marker key={key} id={`${id}-${key}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill={color} />
    </marker>
  );
  // Una punta per a cada color triat a mà.
  const custom = new Map<string, string>();
  for (const el of els) if (el.t === "arrow" && el.c && HEX.test(el.c)) custom.set(markerKey(el), arrowColor(el));
  return <defs>{[m("pass", "#fff"), m("drive", "#fff"), m("run", "#111"), m("shot", "#e53935"), m("sel", "#dbb34d"), ...[...custom].map(([k, c]) => m(k, c))]}</defs>;
}

type Tool = "move" | `p-${Team}` | "cone" | "ball" | "minigoal" | "goal" | `a-${ArrowKind}`;

/** Editor del dibuix: posar jugadores, cons, pilotes, porteries i fletxes; moure i esborrar. */
export function DrillEditor({ value, onChange }: { value: Diagram; onChange: (d: Diagram) => void }) {
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("p-blue");
  const [sel, setSel] = useState<string | null>(null);
  const drag = useRef<{ id: string; ox: number; oy: number; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<El | null>(null);
  const [size, setSize] = useState(1); // mida dels elements nous
  const [grid, setGrid] = useState(false); // quadrícula (i enganxar-s'hi)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const spin = useRef<{ id: string } | null>(null); // girant amb la nansa
  const [color, setColor] = useState<string | null>(null); // color de les fletxes noves (null = el del tipus)

  const pt = (e: RPointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: Math.round(Math.min(W, Math.max(0, p.x)) * 10) / 10, y: Math.round(Math.min(H, Math.max(0, p.y)) * 10) / 10 };
  };
  const set = (els: El[]) => onChange({ ...value, els });

  /**
   * Referències: si l'element queda a prop de la mateixa alçada (o columna) que un altre, o del centre del camp,
   * s'hi enganxa i es mostra una guia. Amb la quadrícula activada, s'enganxa a la quadrícula.
   */
  function snap(x: number, y: number, skip: string | null) {
    const T = 1.3;
    const xs: number[] = [W / 2];
    const ys: number[] = [H / 2];
    for (const el of value.els) {
      if (el.id === skip) continue;
      xs.push(el.x);
      ys.push(el.y);
      if (el.t === "arrow") {
        xs.push(el.x2);
        ys.push(el.y2);
      }
    }
    const near = (v: number, list: number[]) =>
      list.reduce<number | null>((best, c) => (Math.abs(c - v) < T && (best == null || Math.abs(c - v) < Math.abs(best - v)) ? c : best), null);
    let gx = near(x, xs), gy = near(y, ys);
    let nx = gx ?? x, ny = gy ?? y;
    if (grid) {
      if (gx == null) nx = Math.round(x / 2.5) * 2.5;
      if (gy == null) ny = Math.round(y / 2.5) * 2.5;
    }
    nx = Math.round(Math.min(W, Math.max(0, nx)) * 10) / 10;
    ny = Math.round(Math.min(H, Math.max(0, ny)) * 10) / 10;
    if (gx != null) gx = nx;
    if (gy != null) gy = ny;
    return { x: nx, y: ny, gx, gy };
  }

  function down(e: RPointerEvent<SVGSVGElement>) {
    // Nansa de girar
    const handle = (e.target as Element).closest("[data-rot]")?.getAttribute("data-rot");
    if (handle) {
      spin.current = { id: handle };
      svg.current!.setPointerCapture(e.pointerId);
      return;
    }
    const p = pt(e);
    // Amb una fletxa triada, sempre es dibuixa (encara que es comenci sobre una jugadora).
    const hitId = tool.startsWith("a-") ? null : (e.target as Element).closest("[data-el]")?.getAttribute("data-el");
    if (tool === "move" || hitId) {
      if (hitId) {
        setSel(hitId);
        const el = value.els.find((x) => x.id === hitId)!;
        drag.current = { id: hitId, ox: p.x - el.x, oy: p.y - el.y, moved: false };
        svg.current!.setPointerCapture(e.pointerId);
      } else setSel(null);
      return;
    }
    if (tool.startsWith("a-")) {
      setDraft({ id: uid(), t: "arrow", x: p.x, y: p.y, x2: p.x, y2: p.y, kind: tool.slice(2) as ArrowKind, ...(size !== 1 && { s: size }), ...(color && { c: color }) });
      svg.current!.setPointerCapture(e.pointerId);
      return;
    }
    const at = snap(p.x, p.y, null);
    const el: El = tool.startsWith("p-")
      ? { id: uid(), t: "player", x: at.x, y: at.y, team: tool.slice(2) as Team, r: defaultHeading(value.field) }
      : { id: uid(), t: tool as "cone" | "ball" | "minigoal" | "goal", x: at.x, y: at.y };
    if (size !== 1) el.s = size;
    set([...value.els, el]);
    setSel(el.id);
  }

  function move(e: RPointerEvent<SVGSVGElement>) {
    const p = pt(e);
    if (spin.current) {
      const el = value.els.find((x) => x.id === spin.current!.id);
      if (!el || el.t === "arrow") return;
      // angle des del centre; s'enganxa cada 15°
      const deg = (Math.atan2(p.y - el.y, p.x - el.x) * 180) / Math.PI + 90;
      const rr = (((Math.round(deg / 15) * 15) % 360) + 360) % 360;
      // A les jugadores, 0° vol dir "mira amunt" (sense r és sense orientació).
      return set(value.els.map((x) => (x.id === el.id && x.t !== "arrow" ? { ...x, r: x.t === "player" ? rr : rr || undefined } : x)));
    }
    if (draft && draft.t === "arrow") {
      const s2 = snap(p.x, p.y, null);
      setGuides({ x: s2.gx, y: s2.gy });
      return setDraft({ ...draft, x2: s2.x, y2: s2.y });
    }
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const s2 = snap(p.x - d.ox, p.y - d.oy, d.id);
    setGuides({ x: s2.gx, y: s2.gy });
    set(
      value.els.map((el) => {
        if (el.id !== d.id) return el;
        const nx = s2.x;
        const ny = s2.y;
        return el.t === "arrow" ? { ...el, x: nx, y: ny, x2: el.x2 + (nx - el.x), y2: el.y2 + (ny - el.y) } : { ...el, x: nx, y: ny };
      }),
    );
  }

  function up() {
    if (draft && draft.t === "arrow") {
      if (Math.hypot(draft.x2 - draft.x, draft.y2 - draft.y) > 2) {
        set([...value.els, draft]);
        setSel(draft.id);
      }
      setDraft(null);
    }
    drag.current = null;
    spin.current = null;
    setGuides({ x: null, y: null });
  }

  const selected = value.els.find((x) => x.id === sel) ?? null;
  const curSize = selected ? selected.s ?? 1 : size;
  /** Canvia la mida de l'element triat (o la dels nous, si no n'hi ha cap de triat). */
  /** Gira l'element triat (les fletxes giren al voltant del seu punt mig). */
  function rotate(deg: number, absolute = false) {
    if (!selected) return;
    if (selected.t === "arrow") {
      const cx = (selected.x + selected.x2) / 2, cy = (selected.y + selected.y2) / 2;
      const a = (deg * Math.PI) / 180;
      const rot = (x: number, y: number) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
      const [x1, y1] = rot(selected.x, selected.y);
      const [x2, y2] = rot(selected.x2, selected.y2);
      const k = (v: number) => Math.round(v * 10) / 10;
      return set(value.els.map((x) => (x.id === selected.id && x.t === "arrow" ? { ...x, x: k(x1), y: k(y1), x2: k(x2), y2: k(y2) } : x)));
    }
    const cur = selected.r ?? (selected.t === "player" ? defaultHeading(value.field) : 0);
    const next = (((absolute ? deg : cur + deg) % 360) + 360) % 360;
    set(value.els.map((x) => (x.id === selected.id && x.t !== "arrow" ? { ...x, r: x.t === "player" ? next : next || undefined } : x)));
  }
  /** Color de les fletxes noves; si hi ha una fletxa triada, també se li canvia. */
  const paint = (c: string | null) => {
    const v = c && HEX.test(c) ? c.toLowerCase() : null;
    setColor(v);
    if (selected?.t === "arrow") set(value.els.map((x) => (x.id === selected.id && x.t === "arrow" ? { ...x, c: v ?? undefined } : x)));
  };
  const curColor = selected?.t === "arrow" ? selected.c ?? null : color;
  const showColors = selected?.t === "arrow" || tool.startsWith("a-");
  const resize = (v: number) => {
    const k = Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, v)) * 10) / 10;
    if (!selected) return setSize(k);
    set(value.els.map((x) => (x.id === selected.id ? { ...x, s: k === 1 ? undefined : k } : x)));
  };
  const btn = (t: Tool, content: ReactNode, title: string) => (
    <button key={t} type="button" className="tool" aria-pressed={tool === t} title={title} aria-label={title} onClick={() => setTool(t)}>{content}</button>
  );

  return (
    <div className="drill-editor">
      <div className="drill-tools" role="toolbar" aria-label="Eines del dibuix">
        {btn("move", "✋", "Moure / seleccionar")}
        {(["blue", "red", "yellow", "white", "gk"] as Team[]).map((t) =>
          btn(`p-${t}`, <span className="dot" style={{ background: TEAM_FILL[t] }} />, t === "gk" ? "Portera" : `Jugadora (${t})`),
        )}
        {btn("cone", <span className="cone-ico" />, "Con")}
        {btn("ball", "⚽", "Pilota")}
        {btn("minigoal", "⊓", "Porteria petita")}
        {btn("goal", "⊏⊐", "Porteria")}
        {(Object.keys(ARROW) as ArrowKind[]).map((k) =>
          btn(`a-${k}`, <span className="arrow-ico" style={{ borderColor: (color ?? ARROW[k].color) === "#ffffff" ? "#0b1846" : color ?? ARROW[k].color, borderStyle: ARROW[k].dash ? "dashed" : "solid" }} />, `Fletxa: ${ARROW[k].label}`),
        )}
      </div>
      <svg
        ref={svg}
        className="drill editing"
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <Markers id={id} els={draft ? [...value.els, draft] : value.els} />
        <FieldBg field={value.field} />
        {grid && (
          <g stroke="rgba(255,255,255,.18)" strokeWidth={0.12}>
            {Array.from({ length: Math.floor(W / 5) - 1 }, (_, i) => <line key={`gx${i}`} x1={(i + 1) * 5} y1={0} x2={(i + 1) * 5} y2={H} />)}
            {Array.from({ length: Math.floor(H / 5) }, (_, i) => <line key={`gy${i}`} x1={0} y1={(i + 1) * 5} x2={W} y2={(i + 1) * 5} />)}
          </g>
        )}
        {value.els.map((el) => (
          <g key={el.id} data-el={el.id} style={{ cursor: "grab" }}>
            {el.t === "arrow" && <line x1={el.x} y1={el.y} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth={3 * Math.max(1, el.s ?? 1)} />}
            <ElView el={el} selected={el.id === sel} arrowId={id} field={value.field} />
          </g>
        ))}
        {draft && <ElView el={draft} selected={false} arrowId={id} field={value.field} />}
        {/* Guies d'alineació mentre s'arrossega */}
        {guides.x != null && <line x1={guides.x} y1={0} x2={guides.x} y2={H} stroke="#ffd400" strokeWidth={0.25} strokeDasharray="1 0.8" pointerEvents="none" />}
        {guides.y != null && <line x1={0} y1={guides.y} x2={W} y2={guides.y} stroke="#ffd400" strokeWidth={0.25} strokeDasharray="1 0.8" pointerEvents="none" />}
        {/* Nansa per girar l'element triat */}
        {selected && selected.t !== "arrow" && selected.t !== "ball" && (() => {
          const d = (selected.t === "player" ? 4.4 : 3.4) * (selected.s ?? 1) + 1.2;
          const a = (((selected.r ?? (selected.t === "player" ? defaultHeading(value.field) : 0)) - 90) * Math.PI) / 180;
          const hx = selected.x + Math.cos(a) * d, hy = selected.y + Math.sin(a) * d;
          return (
            <g data-rot={selected.id} style={{ cursor: "grab" }}>
              <line x1={selected.x} y1={selected.y} x2={hx} y2={hy} stroke="#ffd400" strokeWidth={0.2} pointerEvents="none" />
              <circle cx={hx} cy={hy} r={1.6} fill="transparent" />
              <circle cx={hx} cy={hy} r={0.75} fill="#ffd400" stroke="#0b1846" strokeWidth={0.2} />
            </g>
          );
        })()}
      </svg>
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <select aria-label="Tipus de camp" value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value as Field })} style={{ width: "auto" }}>
          <option value="full">Camp sencer</option>
          <option value="half">Mig camp</option>
          <option value="blank">Només gespa</option>
        </select>
        {selected?.t === "player" && (
          <input
            type="text"
            maxLength={3}
            placeholder="Lletra"
            aria-label="Lletra de la jugadora"
            value={selected.label ?? ""}
            onChange={(e) => set(value.els.map((x) => (x.id === selected.id && x.t === "player" ? { ...x, label: e.target.value.toUpperCase() } : x)))}
            style={{ width: 70 }}
          />
        )}
        {selected && (
          <button type="button" className="btn small secondary" onClick={() => { set(value.els.filter((x) => x.id !== selected.id)); setSel(null); }}>
            Esborrar
          </button>
        )}
        <button type="button" className="btn small secondary" disabled={value.els.length === 0} onClick={() => window.confirm("Esborrar tot el dibuix?") && (set([]), setSel(null))}>
          Netejar
        </button>
      </div>
      <div className="drill-size">
        <label htmlFor={`${id}-size`}>{selected ? "Mida de l'element" : "Mida dels nous"}</label>
        <button type="button" className="an-ic" aria-label="Més petit" onClick={() => resize(curSize - 0.1)}>−</button>
        <input
          id={`${id}-size`}
          type="range"
          min={SIZE_MIN}
          max={SIZE_MAX}
          step={0.1}
          value={curSize}
          onChange={(e) => resize(Number(e.target.value))}
        />
        <button type="button" className="an-ic" aria-label="Més gran" onClick={() => resize(curSize + 0.1)}>+</button>
        <b>{Math.round(curSize * 100)}%</b>
        {selected && selected.s && selected.s !== 1 && (
          <button type="button" className="btn small secondary" onClick={() => resize(1)}>Normal</button>
        )}
        {!selected && value.els.length > 0 && (
          <button type="button" className="btn small secondary" onClick={() => set(value.els.map((x) => ({ ...x, s: size === 1 ? undefined : size })))}>
            Aplicar a tots
          </button>
        )}
      </div>
      {showColors && (
        <div className="drill-size drill-colors">
          <label>{selected?.t === "arrow" ? "Color de la fletxa" : "Color de les fletxes noves"}</label>
          <button type="button" className="btn small secondary" aria-pressed={curColor == null} onClick={() => paint(null)}>Automàtic</button>
          {ARROW_COLORS.map((c) => (
            <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={curColor === c} onClick={() => paint(c)} />
          ))}
          <label className="swatch-any" title="Qualsevol color">
            <input type="color" aria-label="Triar qualsevol color" value={curColor ?? "#ffffff"} onChange={(e) => paint(e.target.value)} />
            <span>Altres…</span>
          </label>
        </div>
      )}
      <div className="drill-size">
        <label>Orientació</label>
        {selected && selected.t !== "ball" ? (
          <>
            <button type="button" className="btn small secondary" onClick={() => rotate(-15)} aria-label="Girar a l'esquerra">↺ 15°</button>
            <button type="button" className="btn small secondary" onClick={() => rotate(15)} aria-label="Girar a la dreta">↻ 15°</button>
            <button type="button" className="btn small secondary" onClick={() => rotate(90)}>↻ 90°</button>
            {selected.t === "player" && <b>{selected.r ?? defaultHeading(value.field)}°</b>}
            {selected.t !== "arrow" && selected.t !== "player" && <b>{selected.r ?? 0}°</b>}
            {selected.t !== "arrow" && selected.t !== "player" && !!selected.r && <button type="button" className="btn small secondary" onClick={() => rotate(0, true)}>Recte</button>}
          </>
        ) : (
          <span className="muted small">Toca una jugadora, una porteria, un con o una fletxa per girar-la (o arrossega el punt groc). El parèntesi de la jugadora indica cap on mira.</span>
        )}
      </div>
      <div className="drill-size">
        <label><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Quadrícula</label>
        <span className="muted small">Les guies grogues surten soles quan un element queda alineat amb un altre o amb el centre.</span>
      </div>
      <p className="muted small" style={{ margin: "4px 0 0" }}>
        Tria una eina i toca el camp. Les fletxes es dibuixen arrossegant. Amb ✋ (o tocant un element) el pots moure i canviar-ne la mida.
      </p>
    </div>
  );
}
