"use client";

import { useEffect, useState } from "react";
import { DOW_NAMES, endOf, fetchMyNextMeeting, hm, type MeetingSlot } from "@/lib/meetings";
import { isoDow } from "@/lib/dates";
import { madridEpoch } from "@/lib/matchday";

type Mine = MeetingSlot & { duration_min: number; title: string };

/** «Falta…» fins a la reunió: dies si en queda més d'un, si no hores i minuts. */
function left(ms: number): string {
  if (ms <= 0) return "Ara mateix";
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `D'aquí ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `D'aquí ${h} h ${min % 60} min`;
  const d = Math.round(h / 24);
  return d === 1 ? "Demà" : `D'aquí ${d} dies`;
}

/** Jugadora: la seva propera reunió individual amb el staff (només la seva). */
export function MeetingCard({ meId, today }: { meId: string; today: string }) {
  const [m, setM] = useState<Mine | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    fetchMyNextMeeting(meId, today).then((x) => alive && setM(x), () => {});
    return () => { alive = false; };
  }, [meId, today]);
  useEffect(() => {
    if (!m) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [m]);
  if (!m) return null;
  const start = madridEpoch(m.day, hm(m.start_time));
  const end = start + m.duration_min * 60_000;
  if (now > end) return null;
  const isToday = m.day === today;
  const day = Number(m.day.slice(8)), month = Number(m.day.slice(5, 7));
  return (
    <section className={`card meeting-card${isToday ? " today" : ""}`}>
      <div className="mc-date" aria-hidden="true"><b>{day}</b><small>{["GEN", "FEB", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DES"][month - 1]}</small></div>
      <div className="mc-body">
        <span className="mc-k">🗣️ La teva reunió</span>
        <b>{isToday ? "Avui" : DOW_NAMES[isoDow(m.day)]} · {hm(m.start_time)}–{endOf(m.start_time, m.duration_min)} h</b>
        <span className="mc-left">{left(start - now)} · {m.duration_min} min amb el staff</span>
      </div>
    </section>
  );
}
