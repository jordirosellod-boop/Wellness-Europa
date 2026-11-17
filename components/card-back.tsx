"use client";

import { useEffect, useState } from "react";
import { fetchAttendance, fetchSessionsBetween } from "@/lib/attendance";
import { fetchAll, supabase } from "@/lib/supabase";

// La cara del darrere del cromo: la temporada de la jugadora mes a mes (minuts, gols i assistència).
const MONTHS = ["Ag", "Se", "Oc", "No", "De", "Ge", "Fe", "Mç", "Ab", "Mg", "Jn", "Jl"];
type Month = { key: string; label: string; min: number; goals: number; att: number | null };

async function loadMonths(meId: string, from: string, today: string): Promise<Month[]> {
  const sb = supabase();
  const keys: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 7) <= today.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) keys.push(d.toISOString().slice(0, 7));
  const out = new Map<string, Month>(keys.map((k) => [k, { key: k, label: MONTHS[(Number(k.slice(5, 7)) + 4) % 12], min: 0, goals: 0, att: null }]));

  const [mins, fcf, sessions] = await Promise.all([
    fetchAll<{ convocation_id: string; minutes: number }>((f, t) => sb.from("match_minutes").select("convocation_id, minutes").eq("player_id", meId).order("convocation_id").range(f, t)).catch(() => []),
    sb.from("fcf_players").select("fcf_id").eq("profile_id", meId).maybeSingle(),
    fetchSessionsBetween(from, today).catch(() => []),
  ]);
  // Minuts (apuntats pel staff en directe)
  if (mins.length) {
    const { data: cs } = await sb.from("convocations").select("id, match_date").in("id", mins.map((m) => m.convocation_id));
    const day = new Map((cs ?? []).map((c) => [c.id as string, c.match_date as string]));
    for (const m of mins) { const x = out.get((day.get(m.convocation_id) ?? "").slice(0, 7)); if (x) x.min += m.minutes; }
  }
  // Gols (de les actes de la FCF)
  const fid = (fcf.data as { fcf_id: string } | null)?.fcf_id;
  if (fid) {
    const apps = await fetchAll<{ acta_id: string; goals: number }>((f, t) => sb.from("fcf_appearances").select("acta_id, goals").eq("fcf_id", fid).order("acta_id").range(f, t)).catch(() => []);
    if (apps.length) {
      const { data: ms } = await sb.from("fcf_matches").select("acta_id, kickoff").in("acta_id", apps.map((a) => a.acta_id));
      const k = new Map((ms ?? []).map((m) => [m.acta_id as string, ((m.kickoff as string | null) ?? "").slice(0, 7)]));
      for (const a of apps) { const x = out.get(k.get(a.acta_id) ?? ""); if (x) x.goals += a.goals; }
    }
  }
  // Assistència als entrenos
  const tr = sessions.filter((s) => s.kind === "Entrenament");
  const att = await fetchAttendance(tr.map((s) => s.id), meId).catch(() => []);
  const monthOf = new Map(tr.map((s) => [s.id, s.session_date.slice(0, 7)]));
  const tally = new Map<string, { p: number; n: number }>();
  for (const a of att) { const k = monthOf.get(a.session_id); if (!k) continue; const t = tally.get(k) ?? { p: 0, n: 0 }; t.n++; if (a.present) t.p++; tally.set(k, t); }
  for (const [k, t] of tally) { const x = out.get(k); if (x && t.n) x.att = Math.round((t.p / t.n) * 100); }
  return [...out.values()].filter((m) => m.key >= from.slice(0, 7)).slice(-10);
}

function Bars({ label, unit, values, max }: { label: string; unit?: string; values: { k: string; l: string; v: number | null }[]; max: number }) {
  const total = values.reduce((n, x) => n + (x.v ?? 0), 0);
  return (
    <div className="cb-row">
      <div className="cb-h"><span>{label}</span><b>{unit === "%" ? (values.filter((x) => x.v != null).length ? `${Math.round(values.reduce((n, x) => n + (x.v ?? 0), 0) / values.filter((x) => x.v != null).length)}%` : "–") : total}</b></div>
      <div className="cb-bars">
        {values.map((x, i) => (
          <span key={x.k} style={{ ["--h" as string]: `${max ? Math.max(x.v ? 6 : 0, ((x.v ?? 0) / max) * 100) : 0}%`, ["--d" as string]: `${i * 0.05}s` }}>
            <i />
            <small>{x.l}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

export function CardBack({ meId, from, today, season, streak }: { meId: string; from: string; today: string; season: string; streak: number }) {
  const [months, setMonths] = useState<Month[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadMonths(meId, from, today).then((m) => alive && setMonths(m), () => alive && setMonths([]));
    return () => { alive = false; };
  }, [meId, from, today]);
  const m = months ?? [];
  return (
    <div className="pcard-back-in">
      <div className="cb-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escut.png" alt="" width={30} height={30} />
        <b>TEMPORADA {season}</b>
      </div>
      {!months ? <p className="cb-load">Carregant…</p> : (
        <>
          <Bars label="Minuts" values={m.map((x) => ({ k: x.key, l: x.label, v: x.min }))} max={Math.max(1, ...m.map((x) => x.min))} />
          <Bars label="Gols" values={m.map((x) => ({ k: x.key, l: x.label, v: x.goals }))} max={Math.max(1, ...m.map((x) => x.goals))} />
          <Bars label="Entrenos" unit="%" values={m.map((x) => ({ k: x.key, l: x.label, v: x.att }))} max={100} />
        </>
      )}
      <div className="cb-streak">🔥 {streak} wellness seguits</div>
      <span className="cb-hint">Toca per girar-lo</span>
    </div>
  );
}
