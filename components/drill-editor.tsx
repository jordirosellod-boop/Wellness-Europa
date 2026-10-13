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

function ElView({ el, selected, arrowId }: { el: El; selected: boolean; arrowId: string }) {
  const sel = selected ? { stroke: "#dbb34d", strokeWidth: 0.7 } : {};
  switch (el.t) {
    case "player":
      return (
        <g>
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
          stroke={selected ? "#dbb34d" : a.color} strokeWidth={0.45} strokeDasharray={a.dash}
          markerEnd={`url(#${arrowId}-${selected ? "sel" : el.kind})`}
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
      <Markers id={id} />
      <FieldBg field={d.field} />
      {d.els.map((el) => <ElView key={el.id} el={el} selected={false} arrowId={id} />)}
    </svg>
  );
}

function Markers({ id }: { id: string }) {
  const m = (key: string, color: string) => (
    <marker key={key} id={`${id}-${key}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill={color} />
    </marker>
  );
  return <defs>{[m("pass", "#fff"), m("drive", "#fff"), m("run", "#111"), m("shot", "#e53935"), m("sel", "#dbb34d")]}</defs>;
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

  const pt = (e: RPointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: Math.round(Math.min(W, Math.max(0, p.x)) * 10) / 10, y: Math.round(Math.min(H, Math.max(0, p.y)) * 10) / 10 };
  };
  const set = (els: El[]) => onChange({ ...value, els });

  function down(e: RPointerEvent<SVGSVGElement>) {
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
      setDraft({ id: uid(), t: "arrow", x: p.x, y: p.y, x2: p.x, y2: p.y, kind: tool.slice(2) as ArrowKind });
      svg.current!.setPointerCapture(e.pointerId);
      return;
    }
    const el: El = tool.startsWith("p-")
      ? { id: uid(), t: "player", x: p.x, y: p.y, team: tool.slice(2) as Team }
      : { id: uid(), t: tool as "cone" | "ball" | "minigoal" | "goal", x: p.x, y: p.y };
    set([...value.els, el]);
    setSel(el.id);
  }

  function move(e: RPointerEvent<SVGSVGElement>) {
    const p = pt(e);
    if (draft && draft.t === "arrow") return setDraft({ ...draft, x2: p.x, y2: p.y });
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    set(
      value.els.map((el) => {
        if (el.id !== d.id) return el;
        const nx = p.x - d.ox;
        const ny = p.y - d.oy;
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
  }

  const selected = value.els.find((x) => x.id === sel) ?? null;
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
          btn(`a-${k}`, <span className="arrow-ico" style={{ borderColor: ARROW[k].color === "#ffffff" ? "#0b1846" : ARROW[k].color, borderStyle: ARROW[k].dash ? "dashed" : "solid" }} />, `Fletxa: ${ARROW[k].label}`),
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
        <Markers id={id} />
        <FieldBg field={value.field} />
        {value.els.map((el) => (
          <g key={el.id} data-el={el.id} style={{ cursor: "grab" }}>
            {el.t === "arrow" && <line x1={el.x} y1={el.y} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth={3} />}
            <ElView el={el} selected={el.id === sel} arrowId={id} />
          </g>
        ))}
        {draft && <ElView el={draft} selected={false} arrowId={id} />}
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
      <p className="muted small" style={{ margin: "4px 0 0" }}>
        Tria una eina i toca el camp. Les fletxes es dibuixen arrossegant. Amb ✋ (o tocant un element) el pots moure.
      </p>
    </div>
  );
}
