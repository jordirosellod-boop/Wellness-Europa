"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { zigzag } from "@/lib/tactics-render";
import {
  COLORS, DRAW_COLORS, PH, PW, sceneAt, sceneLength, uid,
  type Frame, type Scene, type ShapeKind, type Side, type Token, type TShape, type XY,
} from "@/lib/tactics";

type Tool = "move" | ShapeKind | "us" | "rival" | "ball" | "cone" | "erase";
const TOOLS: [Tool, string, string][] = [
  ["move", "✋", "Moure"],
  ["pass", "➜", "Passada"],
  ["run", "⇢", "Desplaçament"],
  ["dribble", "〰", "Conducció"],
  ["line", "／", "Línia"],
  ["zone", "▭", "Zona"],
  ["ellipse", "◯", "Cercle"],
  ["free", "✎", "Lliure"],
  ["text", "T", "Text"],
  ["us", "+●", "Jugadora nostra"],
  ["rival", "+●", "Jugadora rival"],
  ["ball", "⚽", "Pilota"],
  ["cone", "▲", "Con"],
  ["erase", "⌫", "Esborrar"],
];

/** Camp de futbol (105 x 68) en SVG. */
function PitchSvg() {
  const L = { fill: "none", stroke: "rgba(255,255,255,.92)", strokeWidth: 0.32 } as const;
  return (
    <g>
      <rect x={-2} y={-2} width={PW + 4} height={PH + 4} fill="#24803a" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={(i * PW) / 12} y={0} width={PW / 12 + 0.05} height={PH} fill={i % 2 ? "#2f9a42" : "#2a8a3b"} />
      ))}
      <g {...L}>
        <rect x={0} y={0} width={PW} height={PH} />
        <line x1={PW / 2} y1={0} x2={PW / 2} y2={PH} />
        <circle cx={PW / 2} cy={PH / 2} r={9.15} />
        <rect x={0} y={PH / 2 - 20.16} width={16.5} height={40.32} />
        <rect x={PW - 16.5} y={PH / 2 - 20.16} width={16.5} height={40.32} />
        <rect x={0} y={PH / 2 - 9.16} width={5.5} height={18.32} />
        <rect x={PW - 5.5} y={PH / 2 - 9.16} width={5.5} height={18.32} />
        <path d={`M16.5 ${PH / 2 - 7.3} A9.15 9.15 0 0 1 16.5 ${PH / 2 + 7.3}`} />
        <path d={`M${PW - 16.5} ${PH / 2 - 7.3} A9.15 9.15 0 0 0 ${PW - 16.5} ${PH / 2 + 7.3}`} />
      </g>
      <g fill="rgba(255,255,255,.92)">
        <circle cx={PW / 2} cy={PH / 2} r={0.3} />
        <circle cx={11} cy={PH / 2} r={0.3} />
        <circle cx={PW - 11} cy={PH / 2} r={0.3} />
      </g>
      <rect x={-1.6} y={PH / 2 - 3.66} width={1.6} height={7.32} fill="rgba(255,255,255,.4)" />
      <rect x={PW} y={PH / 2 - 3.66} width={1.6} height={7.32} fill="rgba(255,255,255,.4)" />
    </g>
  );
}

function Markers() {
  return (
    <defs>
      {DRAW_COLORS.map((c) => (
        <marker key={c} id={`tb-${c.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={c} />
        </marker>
      ))}
    </defs>
  );
}

function ShapeSvg({ s, selected, opacity = 1, upright = false }: { s: TShape; selected?: boolean; opacity?: number; upright?: boolean }) {
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  const w = selected ? 0.75 : 0.45;
  const common = { stroke: s.c, strokeWidth: w, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, opacity };
  const mk = `url(#tb-${s.c.slice(1)})`;
  switch (s.k) {
    case "pass":
      return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} markerEnd={mk} />;
    case "run":
      return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} strokeDasharray="1.2 0.9" markerEnd={mk} />;
    case "line":
      return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} />;
    case "dribble":
      return <polyline points={zigzag(a, b).map((p) => p.join(",")).join(" ")} {...common} markerEnd={mk} />;
    case "zone":
      return (
        <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])}
          {...common} fill={s.c} fillOpacity={0.25 * opacity} strokeDasharray="0.8 0.6" />
      );
    case "ellipse":
      return <ellipse cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.abs(b[0] - a[0]) / 2} ry={Math.abs(b[1] - a[1]) / 2} {...common} fill={s.c} fillOpacity={0.22 * opacity} />;
    case "free":
      return <polyline points={s.pts.map((p) => p.join(",")).join(" ")} {...common} />;
    case "text":
      return (
        <text x={a[0]} y={a[1]} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} fill={s.c} opacity={opacity}
          transform={upright ? `rotate(90 ${a[0]} ${a[1]})` : undefined}
          stroke="rgba(0,0,0,.6)" strokeWidth={0.35} paintOrder="stroke" className="tb-font" style={{ textTransform: "uppercase" }}>
          {s.text}
        </text>
      );
  }
}

function TokenSvg({ tok, p, showNames, selected, upright }: { tok: Token; p: XY; showNames: boolean; selected: boolean; upright: boolean }) {
  if (tok.t === "ball") {
    return (
      <g>
        <circle cx={p[0]} cy={p[1]} r={0.85} fill="#fff" stroke={selected ? "#ffd400" : "#111"} strokeWidth={selected ? 0.35 : 0.2} />
        <circle cx={p[0]} cy={p[1]} r={0.32} fill="#111" />
      </g>
    );
  }
  if (tok.t === "cone") {
    return <path d={`M${p[0]} ${p[1] - 1.2} L${p[0] + 1} ${p[1] + 0.8} L${p[0] - 1} ${p[1] + 0.8} Z`} fill={tok.c ?? "#ff8f1f"} stroke={selected ? "#ffd400" : "none"} strokeWidth={0.3} />;
  }
  const fill = tok.side === "us" ? (tok.gk ? COLORS.usGk : COLORS.us) : tok.gk ? COLORS.rivalGk : COLORS.rival;
  return (
    <g>
      <circle cx={p[0]} cy={p[1] + 0.25} r={2.05} fill="rgba(0,0,0,.28)" />
      <circle cx={p[0]} cy={p[1]} r={2.05} fill={fill} stroke={selected ? "#ffd400" : tok.side === "us" ? "#dbb34d" : "#fff"} strokeWidth={selected ? 0.6 : 0.32} />
      <text x={p[0]} y={p[1] + 0.15} textAnchor="middle" dominantBaseline="middle" fontSize={2.5} className="tb-font"
        transform={upright ? `rotate(90 ${p[0]} ${p[1]})` : undefined}
        fill={tok.side === "us" && tok.gk ? "#0b1846" : "#fff"}>
        {tok.n}
      </text>
      {showNames && tok.name && (
        <text x={upright ? p[0] - 3.5 : p[0]} y={upright ? p[1] : p[1] + 3.5} textAnchor="middle" dominantBaseline="middle" fontSize={1.45} className="tb-font"
          transform={upright ? `rotate(90 ${p[0] - 3.5} ${p[1]})` : undefined}
          fill="#fff" stroke="rgba(0,0,0,.7)" strokeWidth={0.4} paintOrder="stroke" style={{ textTransform: "uppercase" }}>
          {tok.name}
        </text>
      )}
    </g>
  );
}

/** Pissarra d'una escena: moure fitxes, dibuixar, fotogrames i reproduir l'animació. */
export function TacticBoard({ scene, onChange, showNames, vertical }: {
  scene: Scene; onChange: (s: Scene) => void; showNames: boolean; vertical: boolean;
}) {
  const [fi, setFi] = useState(0);
  const [tool, setTool] = useState<Tool>("move");
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<TShape | null>(null);
  const [play, setPlay] = useState<{ t: number; speed: number; loop: boolean } | null>(null);
  const [trail, setTrail] = useState(true);
  const g = useRef<SVGGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const raf = useRef(0);
  const frameIx = Math.min(fi, scene.frames.length - 1);
  const frame = scene.frames[frameIx];

  // ----- reproducció -----
  const len = sceneLength(scene);
  const stopPlay = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setPlay(null);
  }, []);
  const startPlay = (speed = 1, loop = false) => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const from = 0;
    const tick = (now: number) => {
      let t = from + ((now - t0) / 1000) * speed;
      if (t >= len) {
        if (!loop) {
          setPlay(null);
          setFi(scene.frames.length - 1);
          return;
        }
        t = t % len;
      }
      setPlay({ t, speed, loop });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const live = play ? sceneAt(scene, play.t) : null;
  const pos = live ? live.pos : frame.pos;

  // ----- edició -----
  const setFrame = (f: Frame) => onChange({ ...scene, frames: scene.frames.map((x, i) => (i === frameIx ? f : x)) });
  const pt = (e: RPointerEvent): XY => {
    const m = g.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [Math.round(Math.max(-1.5, Math.min(PW + 1.5, p.x)) * 10) / 10, Math.round(Math.max(-1.5, Math.min(PH + 1.5, p.y)) * 10) / 10];
  };

  function addToken(tok: Token, at: XY) {
    // la fitxa nova apareix a tots els fotogrames al mateix lloc
    onChange({ ...scene, tokens: [...scene.tokens, tok], frames: scene.frames.map((f) => ({ ...f, pos: { ...f.pos, [tok.id]: at } })) });
    setSel(tok.id);
  }
  function removeToken(id: string) {
    onChange({
      ...scene,
      tokens: scene.tokens.filter((t) => t.id !== id),
      frames: scene.frames.map((f) => {
        const p = { ...f.pos };
        delete p[id];
        return { ...f, pos: p };
      }),
    });
    setSel(null);
  }
  const nextNumber = (side: Side) => {
    const used = new Set(scene.tokens.filter((t) => t.t === "player" && t.side === side).map((t) => (t as { n: string }).n));
    for (let n = 1; n < 100; n++) if (!used.has(String(n))) return String(n);
    return "?";
  };

  function down(e: RPointerEvent<SVGSVGElement>) {
    if (play) return;
    const p = pt(e);
    const hit = (e.target as Element).closest("[data-tok]")?.getAttribute("data-tok");
    const hitShape = (e.target as Element).closest("[data-shape]")?.getAttribute("data-shape");
    if (tool === "erase") {
      if (hit) removeToken(hit);
      else if (hitShape) setFrame({ ...frame, shapes: frame.shapes.filter((s) => s.id !== hitShape) });
      return;
    }
    if (tool === "move" || (hit && !["pass", "run", "dribble", "line", "zone", "ellipse", "free", "text"].includes(tool))) {
      if (hit) {
        const cur = frame.pos[hit];
        if (!cur) return;
        drag.current = { id: hit, dx: p[0] - cur[0], dy: p[1] - cur[1] };
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        setSel(hit);
      } else setSel(hitShape ?? null);
      return;
    }
    if (tool === "us" || tool === "rival") return addToken({ id: uid(), t: "player", side: tool, n: nextNumber(tool) }, p);
    if (tool === "ball") {
      const ball = scene.tokens.find((t) => t.t === "ball");
      if (ball) return setFrame({ ...frame, pos: { ...frame.pos, [ball.id]: p } });
      return addToken({ id: "ball", t: "ball" }, p);
    }
    if (tool === "cone") return addToken({ id: uid(), t: "cone" }, p);
    if (tool === "text") {
      const text = window.prompt("Text:")?.trim();
      if (text) setFrame({ ...frame, shapes: [...frame.shapes, { id: uid(), k: "text", c: color, pts: [p], text: text.slice(0, 40) }] });
      return;
    }
    // Fletxes i dibuixos: si es comença sobre una fitxa, l'origen és el centre de la fitxa.
    const from = hit && frame.pos[hit] ? frame.pos[hit] : p;
    setDraft({ id: uid(), k: tool as ShapeKind, c: color, pts: [from, p] });
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }
  function move(e: RPointerEvent<SVGSVGElement>) {
    if (play) return;
    const p = pt(e);
    if (draft) return setDraft(draft.k === "free" ? { ...draft, pts: [...draft.pts, p] } : { ...draft, pts: [draft.pts[0], p] });
    const d = drag.current;
    if (!d) return;
    setFrame({ ...frame, pos: { ...frame.pos, [d.id]: [Math.round((p[0] - d.dx) * 10) / 10, Math.round((p[1] - d.dy) * 10) / 10] } });
  }
  function up() {
    if (draft) {
      const [a, b] = [draft.pts[0], draft.pts[draft.pts.length - 1]];
      if (draft.k === "free" ? draft.pts.length > 3 : Math.hypot(b[0] - a[0], b[1] - a[1]) > 1.2) setFrame({ ...frame, shapes: [...frame.shapes, draft] });
      setDraft(null);
    }
    drag.current = null;
  }

  // ----- fotogrames -----
  const addFrame = () => {
    const f: Frame = { id: uid(), pos: { ...frame.pos }, shapes: [], note: "", dur: 1.4 };
    const frames = [...scene.frames.slice(0, frameIx + 1), f, ...scene.frames.slice(frameIx + 1)];
    onChange({ ...scene, frames });
    setFi(frameIx + 1);
  };
  const delFrame = () => {
    if (scene.frames.length <= 1) return;
    onChange({ ...scene, frames: scene.frames.filter((_, i) => i !== frameIx) });
    setFi(Math.max(0, frameIx - 1));
  };

  const selTok = scene.tokens.find((t) => t.id === sel);
  const selShape = frame.shapes.find((s) => s.id === sel);
  const view = scene.view === "half" ? { x: PW / 2 - 2, w: PW / 2 + 4 } : { x: -2, w: PW + 4 };
  // En vertical ataquem cap amunt: (x, y) → (y, 105 − x).
  const vb = vertical ? `-2 ${PW - view.x - view.w} ${PH + 4} ${view.w}` : `${view.x} -2 ${view.w} ${PH + 4}`;
  const shownFrame = live ? scene.frames[live.frame] : frame;
  const shapeOpacity = live && live.moving != null ? Math.max(0, 1 - live.k * 1.4) : 1;
  const prev = !live && frameIx > 0 ? scene.frames[frameIx - 1] : null;

  return (
    <div className="tb">
      <div className="tb-tools" role="toolbar" aria-label="Eines de la pissarra">
        {TOOLS.map(([k, ic, label]) => (
          <button key={k} type="button" aria-pressed={tool === k} title={label} aria-label={label} onClick={() => setTool(k)}
            className={k === "us" ? "us" : k === "rival" ? "rv" : ""}>
            {ic}
          </button>
        ))}
        <span className="sep" />
        {DRAW_COLORS.map((c) => (
          <button key={c} type="button" className="col" aria-pressed={color === c} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => setColor(c)} />
        ))}
      </div>

      <div className={`tb-stage${vertical ? " vertical" : ""}`}>
        <svg viewBox={vb} className="tb-svg" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ touchAction: "none", cursor: tool === "move" ? "default" : "crosshair" }}>
          <Markers />
          <g ref={g} transform={vertical ? `translate(0 ${PW}) rotate(-90)` : undefined}>
            <PitchSvg />
            {/* rastre: d'on venen les jugadores (fotograma anterior) */}
            {trail && prev && scene.tokens.map((t) => {
              const a = prev.pos[t.id], b = frame.pos[t.id];
              if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.8) return null;
              return <line key={`tr-${t.id}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(255,255,255,.45)" strokeWidth={0.3} strokeDasharray="0.5 0.6" />;
            })}
            {shownFrame.shapes.map((s) => (
              <g key={s.id} data-shape={s.id} style={{ cursor: tool === "erase" ? "pointer" : undefined }}>
                {s.k !== "text" && s.k !== "zone" && s.k !== "ellipse" && (
                  <polyline points={s.pts.map((p) => p.join(",")).join(" ")} stroke="transparent" strokeWidth={2.4} fill="none" />
                )}
                <ShapeSvg s={s} selected={s.id === sel} opacity={shapeOpacity} upright={vertical} />
              </g>
            ))}
            {draft && <ShapeSvg s={draft} />}
            {scene.tokens.map((t) => {
              const p = pos[t.id];
              if (!p) return null;
              return (
                <g key={t.id} data-tok={t.id} style={{ cursor: play ? "default" : "grab" }}>
                  <TokenSvg tok={t} p={p} showNames={showNames} selected={t.id === sel && !play} upright={vertical} />
                </g>
              );
            })}
          </g>
        </svg>
        {(() => {
          const note = (live ? scene.frames[live.moving ?? live.frame]?.note : frame.note) || "\u00a0";
          // (amb «key», el text nou entra animat cada cop que canvia)
          return <div className="tb-caption tb-font" aria-live="polite"><span key={note}>{note}</span></div>;
        })()}
      </div>

      {/* Edició de l'element triat */}
      {!play && selTok && selTok.t === "player" && (
        <div className="tb-edit">
          <span className="muted small">{selTok.side === "us" ? "Nostra" : "Rival"}</span>
          <input type="text" maxLength={3} value={selTok.n} aria-label="Dorsal" style={{ width: 56, textAlign: "center" }}
            onChange={(e) => onChange({ ...scene, tokens: scene.tokens.map((t) => (t.id === selTok.id && t.t === "player" ? { ...t, n: e.target.value } : t)) })} />
          <input type="text" maxLength={16} value={selTok.name ?? ""} placeholder="Nom (opcional)" aria-label="Nom"
            onChange={(e) => onChange({ ...scene, tokens: scene.tokens.map((t) => (t.id === selTok.id && t.t === "player" ? { ...t, name: e.target.value || undefined } : t)) })} />
          <label className="small"><input type="checkbox" checked={!!selTok.gk}
            onChange={(e) => onChange({ ...scene, tokens: scene.tokens.map((t) => (t.id === selTok.id && t.t === "player" ? { ...t, gk: e.target.checked } : t)) })} /> Portera</label>
          <button type="button" className="btn small secondary" onClick={() => removeToken(selTok.id)}>Treure</button>
        </div>
      )}
      {!play && selShape && (
        <div className="tb-edit">
          <span className="muted small">Dibuix</span>
          <button type="button" className="btn small secondary" onClick={() => { setFrame({ ...frame, shapes: frame.shapes.filter((s) => s.id !== selShape.id) }); setSel(null); }}>Esborrar</button>
        </div>
      )}

      {/* Fotogrames i reproducció */}
      <div className="tb-frames">
        <div className="tb-play">
          {play ? (
            <button type="button" className="btn small" onClick={stopPlay}>⏸ Aturar</button>
          ) : (
            <button type="button" className="btn small" disabled={scene.frames.length < 2} onClick={() => startPlay(1, false)}>▶ Reproduir</button>
          )}
          <button type="button" className="btn small secondary" disabled={scene.frames.length < 2} onClick={() => startPlay(0.5, false)}>▶ Lent</button>
          <button type="button" className="btn small secondary" disabled={scene.frames.length < 2} onClick={() => startPlay(1, true)}>🔁</button>
          <label className="small"><input type="checkbox" checked={trail} onChange={(e) => setTrail(e.target.checked)} /> Rastre</label>
          {play && <progress max={len} value={play.t} className="tb-progress" />}
        </div>
        <div className="tb-frame-list" role="tablist" aria-label="Fotogrames">
          {scene.frames.map((f, i) => (
            <button key={f.id} type="button" role="tab" aria-selected={i === (live ? live.frame : frameIx)} onClick={() => { stopPlay(); setFi(i); setSel(null); }}>
              {i + 1}
            </button>
          ))}
          <button type="button" className="add" onClick={addFrame} disabled={!!play} title="Fotograma nou (copia les posicions)">+</button>
          <button type="button" onClick={delFrame} disabled={!!play || scene.frames.length <= 1} title="Esborrar fotograma">🗑</button>
        </div>
        {!play && (
          <div className="tb-frame-edit">
            <input type="text" maxLength={140} placeholder={`Nota del fotograma ${frameIx + 1} (surt a la pantalla i al vídeo)`} value={frame.note}
              onChange={(e) => setFrame({ ...frame, note: e.target.value })} />
            {frameIx > 0 && (
              <select value={frame.dur} aria-label="Velocitat del moviment" onChange={(e) => setFrame({ ...frame, dur: Number(e.target.value) })}>
                {[0.6, 1, 1.4, 2, 3].map((d) => <option key={d} value={d}>{d} s</option>)}
              </select>
            )}
          </div>
        )}
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          Mou les fitxes a cada fotograma i toca ▶: es mouran d&apos;un lloc a l&apos;altre. Les fletxes que comencen sobre una jugadora surten del seu centre.
        </p>
      </div>
    </div>
  );
}
