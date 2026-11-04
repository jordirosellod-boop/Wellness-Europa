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
    return () => document.removeEventListener("click", on, true);
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
      if (!top || !h1 || h1.offsetParent === null) return setTitle(null);
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
