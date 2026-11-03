"use client";

import { Fragment, useEffect, useState } from "react";
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
