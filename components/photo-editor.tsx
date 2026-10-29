"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { defaultAvatar, defaultPlace, headX, FULL_CROP, THUMB_RATIO, type Crop, type Place } from "@/lib/cutout";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const MIN = 0.08; // el tros més petit que es pot triar (8 % de la foto)

type Drag = { mode: "move" | "nw" | "ne" | "sw" | "se"; px: number; py: number; start: Crop };

/** Pas 1: triar el tros de la foto on hi ha la jugadora (abans de treure el fons). */
export function CropStep({ src, name, onCancel, onDone }: { src: string; name: string; onCancel: () => void; onDone: (c: Crop) => void }) {
  const [crop, setCrop] = useState<Crop>(FULL_CROP);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  function down(mode: Drag["mode"], e: PointerEvent<HTMLElement>) {
    e.preventDefault(); e.stopPropagation();
    box.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, start: crop };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current, r = box.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = (e.clientX - d.px) / r.width, dy = (e.clientY - d.py) / r.height;
    const s = d.start;
    if (d.mode === "move") {
      setCrop({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
      return;
    }
    let { x, y } = s, x2 = s.x + s.w, y2 = s.y + s.h;
    if (d.mode.includes("w")) x = clamp(s.x + dx, 0, x2 - MIN); else x2 = clamp(x2 + dx, x + MIN, 1);
    if (d.mode.includes("n")) y = clamp(s.y + dy, 0, y2 - MIN); else y2 = clamp(y2 + dy, y + MIN, 1);
    setCrop({ x, y, w: x2 - x, h: y2 - y });
  }
  const up = () => { drag.current = null; };
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setCrop((c) => ({ ...c, x: clamp(c.x + d[0], 0, 1 - c.w), y: clamp(c.y + d[1], 0, 1 - c.h) }));
  }

  const pct = (v: number) => `${v * 100}%`;
  return (
    <div className="photo-edit">
      <b>{name} · 1 de 2: retalla</b>
      <p className="muted small">Arrossega el requadre i les cantonades perquè només hi quedi ella (si hi surten companyes, deixa-les fora).</p>
      <div ref={box} className="crop-box" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Foto original de ${name}`} draggable={false} />
        <div className="crop-rect" style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
          onPointerDown={(e) => down("move", e)} tabIndex={0} role="group" aria-label="Tros triat (fletxes per moure'l)" onKeyDown={key}>
          {(["nw", "ne", "sw", "se"] as const).map((m) => <span key={m} className={`crop-h ${m}`} onPointerDown={(e) => down(m, e)} aria-hidden="true" />)}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn small" onClick={() => onDone(crop)}>Treure el fons ›</button>
        <button type="button" className="btn small secondary" onClick={() => setCrop(FULL_CROP)}>Tota la foto</button>
        <button type="button" className="btn small secondary" onClick={onCancel}>Cancel·lar</button>
      </div>
    </div>
  );
}

type Size = { w: number; h: number };

/** Una finestra (de proporció «ratio») sobre la foto retallada, pintada amb CSS per a les vistes prèvies. */
function Framed({ src, size, p, h, ratio }: { src: string; size: Size; p: Place; h: number; ratio: number }) {
  const k = h / p.h;
  return (
    <span className="framed" style={{ width: h * ratio, height: h }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} style={{ width: size.w * k, height: size.h * k, left: -p.x * k, top: -p.y * k }} />
    </span>
  );
}

/** Arrossegar, fletxes i zoom sobre una finestra. Zoom = quantes vegades hi cap la jugadora sencera d'alt (1 = cos sencer). */
function FrameEditor({ src, size, p, setP, ratio, box, round, label, max = 4 }: {
  src: string; size: Size; p: Place; setP: (f: (c: Place) => Place) => void; ratio: number; box: number; round?: boolean; label: string; max?: number;
}) {
  const drag = useRef<{ px: number; py: number; start: Place } | null>(null);
  const k = box / p.h;
  const zoom = size.h / p.h;
  function setZoom(z: number) {
    setP((c) => {
      const h = size.h / z, cx = c.x + (c.h * ratio) / 2, cy = c.y + c.h / 2;
      return { h, x: cx - (h * ratio) / 2, y: cy - h / 2 };
    });
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, start: p };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const start = d.start, dx = (e.clientX - d.px) / k, dy = (e.clientY - d.py) / k;
    setP(() => ({ ...start, x: start.x - dx, y: start.y - dy }));
  }
  const up = () => { drag.current = null; };
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = (e.shiftKey ? 20 : 4) / k;
    const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setP((c) => ({ ...c, x: c.x + d[0], y: c.y + d[1] }));
  }
  return (
    <div className="frame-ed">
      <div className={`place-box${round ? " round" : ""}`} style={{ width: box * ratio, height: box } as CSSProperties}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        tabIndex={0} role="group" aria-label={`${label} (arrossega-la o fes servir les fletxes)`} onKeyDown={key}>
        <Framed src={src} size={size} p={p} h={box} ratio={ratio} />
      </div>
      <label className="place-zoom">
        <span>Zoom</span>
        <input type="range" min={1} max={max} step={0.02} value={clamp(zoom, 1, max)} onChange={(e) => setZoom(Number(e.target.value))} aria-label={`Zoom: ${label}`} />
      </label>
    </div>
  );
}

export type Placement = { thumb: Place; avatar: Place };

/** Pas 2: col·locar-la a la convocatòria i, a part, a l'avatar. */
export function PlaceStep({ cutout, name, gk, dorsal, busy, onCancel, onSave }: {
  cutout: string; name: string; gk?: boolean; dorsal?: number | null; busy: boolean;
  onCancel: () => void; onSave: (p: Placement) => void;
}) {
  const [size, setSize] = useState<Size | null>(null);
  const [p, setP] = useState<Place | null>(null);
  const [a, setA] = useState<Place | null>(null);
  const [head, setHead] = useState(0);

  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      const hx = headX(im);
      setSize({ w: im.width, h: im.height });
      setHead(hx);
      setP(defaultPlace(im.width, im.height));
      setA(defaultAvatar(im.width, im.height, hx));
    };
    im.src = cutout;
  }, [cutout]);
  if (!size || !p || !a) return <div className="photo-edit"><p className="muted small">Carregant…</p></div>;

  return (
    <div className="photo-edit">
      <b>{name} · 2 de 2: col·loca</b>
      <p className="muted small">Arrossega-la i fes zoom fins que quedi bé. La convocatòria i l&apos;avatar es col·loquen per separat.</p>

      <h3 className="place-h">A la convocatòria</h3>
      <div className="place-row">
        <FrameEditor src={cutout} size={size} p={p} setP={(f) => setP((c) => (c ? f(c) : c))} ratio={THUMB_RATIO} box={220} label="Foto de la convocatòria" />
        <div className="place-previews" aria-hidden="true">
          <span className="place-k">Així surt</span>
          <span className="place-tile">
            <Framed src={cutout} size={size} p={p} h={88} ratio={THUMB_RATIO} />
            <span className="place-tile-foot">{dorsal ?? "–"}</span>
          </span>
        </div>
      </div>

      <h3 className="place-h">A l&apos;avatar</h3>
      <div className="place-row">
        <FrameEditor src={cutout} size={size} p={a} setP={(f) => setA((c) => (c ? f(c) : c))} ratio={1} box={170} round max={8} label="Foto de l'avatar" />
        <div className="place-previews" aria-hidden="true">
          <span className="place-k">Així surt</span>
          <span className="place-greet">
            <span>Hola!</span>
            <span className={`place-avatar${gk ? " gk" : ""}`}><Framed src={cutout} size={size} p={a} h={56} ratio={1} /></span>
          </span>
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn small" disabled={busy} onClick={() => onSave({ thumb: p, avatar: a })}>{busy ? "Desant…" : "Desar la foto"}</button>
        <button type="button" className="btn small secondary" disabled={busy} onClick={() => { setP(defaultPlace(size.w, size.h)); setA(defaultAvatar(size.w, size.h, head)); }}>Restablir</button>
        <button type="button" className="btn small secondary" disabled={busy} onClick={onCancel}>Cancel·lar</button>
      </div>
    </div>
  );
}
