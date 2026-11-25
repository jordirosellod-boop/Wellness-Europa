"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Un número que puja de 0 fins al seu valor quan apareix a la pantalla (mig segon). */
export function CountUp({ value, suffix = "", decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  const [landed, setLanded] = useState(false);

  // Abans de pintar: comença a 0 (si no hi ha moviment reduït)
  useLayoutEffect(() => {
    if (done.current || reduced() || !Number.isFinite(value) || value <= 0) return;
    setShown(0);
  }, [value, decimals]);

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
        const p = Math.pow(10, decimals);
        setShown(Math.round(value * (1 - Math.pow(1 - k, 3)) * p) / p);
        if (k < 1) raf = requestAnimationFrame(step); else setLanded(true);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, decimals]);

  return <span ref={ref} className={`count-up${landed ? " landed" : ""}`}>{decimals ? shown.toFixed(decimals).replace(".", ",") : shown}{suffix}</span>;
}

/** Un text com «94%», «#2», «7,8» o «12»: la part numèrica puja; la resta es queda igual. */
export function Num({ text }: { text: string | number }) {
  const m = String(text).match(/^([^\d]*)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!m) return <>{text}</>;
  const dec = /[.,]/.test(m[2]) ? m[2].split(/[.,]/)[1].length : 0;
  return <>{m[1]}<CountUp value={Number(m[2].replace(",", "."))} decimals={dec} suffix={m[3]} /></>;
}
