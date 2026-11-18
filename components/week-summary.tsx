"use client";

import { useEffect, useState } from "react";
import { fetchAttendance, fetchSessionsBetween } from "@/lib/attendance";
import { addDays, isoDow, startOfWeek } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";

type Week = { from: string; to: string; trained: number; trainings: number; wellAvg: number | null; wellDone: number; sessions: number; minutes: number; matches: number };

async function loadWeek(meId: string, from: string, to: string): Promise<Week> {
  const sb = supabase();
  const sessions = (await fetchSessionsBetween(from, to)).filter((s) => !s.cancelled);
  const tr = sessions.filter((s) => s.kind === "Entrenament");
  const [att, well, convos] = await Promise.all([
    fetchAttendance(tr.map((s) => s.id), meId).catch(() => []),
    sessions.length ? fetchAll<{ score: number }>((f, t) => sb.from("wellness").select("score").eq("player_id", meId).in("session_id", sessions.map((s) => s.id)).order("id").range(f, t)).catch(() => []) : Promise.resolve([]),
    sb.from("convocations").select("id").gte("match_date", from).lte("match_date", to),
  ]);
  const cids = ((convos.data ?? []) as { id: string }[]).map((c) => c.id);
  const mins = cids.length ? ((await sb.from("match_minutes").select("minutes").eq("player_id", meId).in("convocation_id", cids)).data ?? []) as { minutes: number }[] : [];
  const absent = att.filter((a) => !a.present).length;
  return {
    from, to,
    trained: att.filter((a) => a.present).length, trainings: att.length || tr.length,
    wellAvg: well.length ? well.reduce((n, w) => n + Number(w.score), 0) / well.length : null,
    wellDone: well.length, sessions: Math.max(0, sessions.length - absent),
    minutes: mins.reduce((n, m) => n + m.minutes, 0), matches: mins.filter((m) => m.minutes > 0).length,
  };
}

const dm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;

/** Diumenge (la setmana que acaba) i dilluns (la passada): el resum de la setmana de la jugadora. */
export function WeekSummaryCard({ meId, today }: { meId: string; today: string }) {
  const dow = isoDow(today);
  const from = dow === 7 ? startOfWeek(today) : dow === 1 ? startOfWeek(addDays(today, -1)) : null;
  const [w, setW] = useState<Week | null>(null);
  useEffect(() => {
    if (!from) return;
    let alive = true;
    loadWeek(meId, from, addDays(from, 6)).then((x) => alive && setW(x), () => {});
    return () => { alive = false; };
  }, [meId, from]);
  if (!from || !w || (!w.trainings && !w.minutes && !w.wellDone)) return null;
  const perfect = w.trainings > 0 && w.trained === w.trainings;
  const tiles: [string, string, string][] = [
    [w.trainings ? `${w.trained}/${w.trainings}` : "–", "entrenos", "entreno"],
    [w.wellAvg == null ? "–" : w.wellAvg.toFixed(1).replace(".", ","), "wellness", "well"],
    [w.sessions ? `${Math.min(100, Math.round((w.wellDone / w.sessions) * 100))}%` : "–", "omplerts", "fill"],
    [w.minutes ? String(w.minutes) : "0", w.matches === 1 ? "minuts · 1 partit" : `minuts${w.matches ? ` · ${w.matches} partits` : ""}`, "min"],
  ];
  const line = perfect && w.wellDone >= w.sessions ? "Setmana perfecta: no t'has deixat res. 👏"
    : perfect ? "No has faltat a cap entreno. Molt bé! 💪"
    : w.wellDone < w.sessions ? "Recorda omplir el wellness cada dia: ens ajuda a cuidar-te."
    : "Bona feina aquesta setmana. Seguim! 💙";
  return (
    <section className="card wk-sum" aria-label="El resum de la teva setmana">
      <div className="wk-sum-h"><b>📊 La teva setmana</b><small>{dm(w.from)} – {dm(w.to)}</small></div>
      <div className="wk-sum-tiles">
        {tiles.map(([v, l, k], i) => (
          <div key={k} style={{ ["--d" as string]: `${i * 0.06}s` }}><b>{v}</b><small>{l}</small></div>
        ))}
      </div>
      <p className="wk-sum-line">{line}</p>
    </section>
  );
}
