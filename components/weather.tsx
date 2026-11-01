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
