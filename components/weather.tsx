"use client";

import { useEffect, useState } from "react";
import { forecastAt, sky, tip, townOf, type Forecast } from "@/lib/weather";

/** «🌧️ 12° · pluja 70 % · porta impermeable» per a l'hora de l'entreno o del partit. */
export function WeatherChip({ date, time, address, dark = false }: { date: string; time: string | null; address?: string | null; dark?: boolean }) {
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    let alive = true;
    forecastAt(date, time, townOf(address)).then((x) => alive && setF(x), () => {});
    return () => { alive = false; };
  }, [date, time, address]);
  if (!f) return null;
  const s = sky(f.code);
  const t = tip(f);
  return (
    <span className={`weather${dark ? " dark" : ""}`} title={`Previsió: ${s.label}`}>
      <span aria-hidden="true">{s.icon}</span> {f.temp}°{f.rain >= 20 ? ` · pluja ${f.rain} %` : ""}{t ? ` · ${t}` : ""}
    </span>
  );
}

/** Efecte del temps a la targeta del partit: gotes si plou, flocs si neva, rajos suaus si fa sol de dia. */
export function WeatherFx({ date, time, address }: { date: string; time: string | null; address?: string | null }) {
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    let alive = true;
    forecastAt(date, time, townOf(address)).then((x) => alive && setF(x), () => {});
    return () => { alive = false; };
  }, [date, time, address]);
  if (!f) return null;
  const c = f.code;
  const kind = (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95 ? "rain" : (c >= 71 && c <= 77) || c === 85 || c === 86 ? "snow" : c <= 1 && (!time || time.slice(0, 2) < "18") ? "sun" : null;
  if (!kind) return null;
  return <span className={`wx-fx wx-${kind}`} aria-hidden="true">{kind === "sun" && <i />}</span>;
}
