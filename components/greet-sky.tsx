"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { nowMadridHHMM } from "@/lib/wellness";

type Sky = { phase: "alba" | "dia" | "posta" | "nit"; x: number; y: number };

// Sortida i posta aproximades a Barcelona (prou per a un fons; a l'hivern el sol surt cap a les 8 i es pon cap a les 6)
const RISE = 7.5, SET = 18.25;

/** On és el sol (o la lluna) i quin color té el cel a una hora («19:42»). x i y en % de la capçalera. */
export function skyAt(hhmm: string): Sky {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h + m / 60;
  const day = t >= RISE && t <= SET;
  // Arc: surt per l'esquerra, puja i baixa per la dreta
  const f = day ? (t - RISE) / (SET - RISE) : ((t - SET + 24) % 24) / (24 - (SET - RISE));
  const x = 30 + 58 * f, y = 88 - 50 * Math.sin(Math.PI * f);
  const phase = t >= RISE - 1 && t < RISE + 1.25 ? "alba" : t >= SET - 1.5 && t < SET + 1.25 ? "posta" : day ? "dia" : "nit";
  return { phase, x: Math.round(x), y: Math.round(y) };
}

/**
 * El fons de la salutació: el color del cel i el sol (o la lluna) on toca segons l'hora, i la grada del CEE
 * a sota, que en baixar per la pantalla es mou més a poc a poc (profunditat).
 */
export function GreetSky() {
  const [sky, setSky] = useState<Sky>(() => skyAt(nowMadridHHMM()));
  useEffect(() => {
    const id = setInterval(() => setSky(skyAt(nowMadridHHMM())), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        document.documentElement.style.setProperty("--sy", String(Math.min(200, Math.max(0, window.scrollY))));
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);
  const style = { "--sun-x": `${sky.x}%`, "--sun-y": `${sky.y}%` } as CSSProperties;
  return (
    <span className="greet-sky" data-sky={sky.phase} style={style} aria-hidden="true">
      <i className="gs-grada" />
    </span>
  );
}
