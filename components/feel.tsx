"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { haptic, setSoundOn, soundOn } from "@/lib/feel";
import { onUndo, type Undoable } from "@/lib/undo";

/** El ✓ es dibuixa quan apareix el missatge (en lloc del caràcter ✓). */
export function Ticked({ text }: { text: string }) {
  const parts = text.split("✓");
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={`${text}-${i}`}>
          {p}
          {i < parts.length - 1 && (
            <svg className="tick" viewBox="0 0 16 16" width="1em" height="1em" aria-label="fet"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
          )}
        </Fragment>
      ))}
    </>
  );
}

/** Vibració suau en tocar els botons principals i les accions marcades amb data-haptic. */
export function HapticTouches() {
  useEffect(() => {
    const on = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button.btn:not(.secondary):not(:disabled), [data-haptic], .scale button, .tag-btn, .roll-btn, .ml-p");
      if (el) haptic();
    };
    document.addEventListener("click", on, true);
    // Onada de llum daurada des d'on es toca, als botons principals
    const down = (e: PointerEvent) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const b = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("a.btn:not(.secondary), button.btn:not(.secondary):not(:disabled)");
      if (!b) return;
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      if (cs.position === "static") b.style.position = "relative";
      if (cs.overflow === "visible") b.style.overflow = "hidden";
      const size = Math.max(r.width, r.height) * 2.2;
      const w = document.createElement("span");
      w.className = "tap-wave";
      w.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      b.appendChild(w);
      setTimeout(() => w.remove(), 650);
    };
    document.addEventListener("pointerdown", down, true);
    return () => { document.removeEventListener("click", on, true); document.removeEventListener("pointerdown", down, true); };
  }, []);
  return null;
}

/** L'avís «Esborrat · Desfer» de baix. */
export function UndoToast() {
  const [u, setU] = useState<Undoable | null>(null);
  useEffect(() => onUndo(setU), []);
  if (!u) return null;
  return (
    <div className="undo-toast" role="status" key={u.id}>
      <span>{u.text}</span>
      <button type="button" onClick={() => { haptic(); u.undo(); }}>Desfer</button>
      <i className="undo-bar" aria-hidden="true" />
    </div>
  );
}

/** Botonet per encendre o apagar els sons (es recorda en aquest dispositiu). */
export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => { Promise.resolve().then(() => setOn(soundOn())); }, []);
  return (
    <button type="button" className="sound-toggle" aria-pressed={on} aria-label={on ? "Apagar els sons" : "Encendre els sons"}
      onClick={() => { setSoundOn(!on); setOn(!on); }}>
      {on ? "🔊" : "🔇"}
    </button>
  );
}

/**
 * Lliscar el dit cap als costats per passar de setmana/mes/dia: toca els botons marcats amb
 * data-swipe="prev"/"next" de la pantalla (si n'hi ha). No es fa sobre dibuixos, vídeos ni camps.
 */
export function SwipeNav() {
  useEffect(() => {
    let x0 = 0, y0 = 0, t0 = 0, ok = false;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      const el = e.target as HTMLElement;
      ok = e.touches.length === 1 && !el.closest("canvas, svg, video, iframe, input, textarea, select, [contenteditable], [data-noswipe], .convo-grid, .tactic-board, .pitch, .an-stage, .tag-grid");
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
    };
    const end = (e: TouchEvent) => {
      if (!ok) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 > 700 || Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
      const dir = dx < 0 ? "next" : "prev";
      const btn = [...document.querySelectorAll<HTMLButtonElement>(`main [data-swipe="${dir}"]`)].find((b) => !b.disabled && b.offsetParent !== null);
      if (!btn) return;
      haptic();
      btn.click();
      const main = document.querySelector("main");
      if (main && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        main.classList.remove("swipe-next", "swipe-prev");
        void main.offsetWidth;
        main.classList.add(`swipe-${dir}`);
        setTimeout(() => main.classList.remove(`swipe-${dir}`), 400);
      }
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    return () => { document.removeEventListener("touchstart", start); document.removeEventListener("touchend", end); };
  }, []);
  return null;
}

/** Títol gran que, en baixar, passa a la barra de dalt (com a les apps de l'iPhone). */
export function CompactTitle() {
  const [title, setTitle] = useState<string | null>(null);
  const [bar, setBar] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const top = document.querySelector<HTMLElement>(".topbar");
      if (top !== bar) setBar(top);
      const h1 = document.querySelector<HTMLElement>("main h1");
      // Si la barra ja té el menú (staff), no hi ha lloc per al títol
      const nav = top?.querySelector<HTMLElement>(".nav");
      if (!top || !h1 || h1.offsetParent === null || (nav && nav.offsetWidth > 0 && nav.childElementCount > 0)) return setTitle(null);
      const gone = h1.getBoundingClientRect().bottom < top.getBoundingClientRect().bottom - 4;
      setTitle(gone ? (h1.textContent ?? "").trim().slice(0, 40) || null : null);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    check();
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [bar]);
  useEffect(() => { bar?.classList.toggle("has-title", !!title); }, [bar, title]);
  if (!bar) return null;
  return createPortal(<span className={`tb-title${title ? " on" : ""}`} aria-hidden="true">{title}</span>, bar);
}

/**
 * Sorpresa amagada: sacsejar el mòbil a l'inici fa ploure escuts amb «FORÇA EUROPA!».
 * A l'iPhone només funciona si ja s'ha donat permís de moviment (p. ex. tocant el cromo); no es demana mai sol.
 */
export function ShakeCrests() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = 0, hits: number[] = [], prev: { x: number; y: number; z: number } | null = null;
    const onMotion = (e: DeviceMotionEvent) => {
      const p = window.location.pathname;
      if (p !== "/j" && p !== "/entrenador") return;
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const cur = { x: a.x, y: a.y, z: a.z };
      if (prev) {
        const d = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) + Math.abs(cur.z - prev.z);
        const t = Date.now();
        if (d > 28) {
          hits = [...hits.filter((h) => t - h < 900), t];
          if (hits.length >= 3 && t - last > 6000) { last = t; hits = []; haptic(); setOn(true); }
        }
      }
      prev = cur;
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);
  if (!on) return null;
  return <CrestRain onDone={() => setOn(false)} />;
}

function CrestRain({ onDone }: { onDone: () => void }) {
  const [crests] = useState(() => Array.from({ length: 26 }, (_, i) => ({
    left: Math.random() * 100, size: 26 + Math.random() * 34, delay: Math.random() * 0.9, dur: 1.6 + Math.random() * 1.2, rot: (Math.random() - 0.5) * 540, key: i,
  })));
  useEffect(() => { const t = setTimeout(onDone, 3400); return () => clearTimeout(t); }, [onDone]);
  return createPortal(
    <div className="crest-rain" aria-hidden="true">
      {crests.map((c) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={c.key} src="/escut.png" alt="" style={{ left: `${c.left}%`, width: c.size, height: c.size, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ["--rot" as string]: `${c.rot}deg` }} />
      ))}
      <b>FORÇA<br />EUROPA!</b>
    </div>,
    document.body,
  );
}

/** Pujada de nivell de la ratxa: rajos daurats, l'escut i «NIVELL n» a pantalla completa. Es tanca sol o tocant. */
export function LevelUp({ level, n, onDone }: { level: number; n: number; onDone: () => void }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onDone(); return; }
    const t1 = setTimeout(() => haptic(), 450);
    const t2 = setTimeout(onDone, 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="level-up" role="dialog" aria-label={`Nivell ${level}`} onClick={onDone}>
      <i className="lu-rays" aria-hidden="true" />
      <div className="lu-body">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escut.png" alt="" width={110} height={110} />
        <span className="lu-k">Nou nivell de ratxa</span>
        <b>NIVELL {level}</b>
        <span className="lu-n">🔥 {n} wellness seguits</span>
      </div>
    </div>,
    document.body,
  );
}
