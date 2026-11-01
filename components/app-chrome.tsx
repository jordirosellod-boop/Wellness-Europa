"use client";

import { useEffect, useRef, useState } from "react";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PULL = 70; // px que cal estirar per actualitzar

/** Estirar cap avall des de dalt de tot per actualitzar, amb l'escut que gira. */
export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const cur = useRef(0);

  useEffect(() => {
    const blocked = (t: EventTarget | null) =>
      !(t instanceof Element) ||
      !!t.closest("canvas, input, textarea, select, .tb-stage, .crop-box, .place-box, .pcard, .pitch, .pz, .mw, .picker-backdrop, [data-no-ptr]");
    const down = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1 && !blocked(e.target) ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { cur.current = 0; setPull(0); return; }
      cur.current = Math.min(110, dy * 0.5);
      setPull(cur.current);
    };
    const up = () => {
      if (start.current == null) return;
      start.current = null;
      if (cur.current >= PULL) {
        setBusy(true);
        try { sessionStorage.setItem("skip-splash", "1"); } catch { /* sense emmagatzematge: sortirà l'entrada */ }
        window.location.reload();
      } else setPull(0);
      cur.current = 0;
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, []);

  if (!pull && !busy) return null;
  const k = Math.min(1, pull / PULL);
  return (
    <div className={`ptr${busy ? " busy" : ""}${k >= 1 ? " ready" : ""}`} style={{ transform: `translate(-50%, ${busy ? 54 : pull * 0.8}px)`, opacity: busy ? 1 : k }} role="status" aria-label={busy ? "Actualitzant" : "Estira per actualitzar"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/escut.png" alt="" width={34} height={34} style={busy || reduced() ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
    </div>
  );
}

/** Franja discreta quan el mòbil es queda sense connexió. */
export function OfflineBanner() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const upd = () => setOff(!navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  if (!off) return null;
  return (
    <div className="offline" role="status">
      <span aria-hidden="true">📡</span> Sense connexió · ho tornarem a provar quan tornis a tenir senyal
    </div>
  );
}
