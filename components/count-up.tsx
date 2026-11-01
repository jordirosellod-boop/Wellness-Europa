"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Un número que puja de 0 fins al seu valor quan apareix a la pantalla (mig segon). */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const done = useRef(false);

  // Abans de pintar: comença a 0 (si no hi ha moviment reduït)
  useLayoutEffect(() => {
    if (done.current || reduced() || !Number.isFinite(value) || value <= 0) return;
    setShown(0);
  }, [value]);

  useEffect(() => {
    if (done.current || reduced() || !Number.isFinite(value) || value <= 0) { setShown(value); return; }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const run = () => {
      done.current = true;
      const t0 = performance.now(), dur = 550;
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / dur);
        setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);

  return <span ref={ref} className="count-up">{shown}{suffix}</span>;
}
