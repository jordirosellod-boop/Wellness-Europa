"use client";

import { useEffect, useState } from "react";
import { loadTeamAcwr } from "@/lib/acwr-data";
import { MIN_DAYS } from "@/lib/acwr";
import { addDays } from "@/lib/dates";
import { LEVEL_ORDER, readinessOf, type Level, type Readiness, type WellRow } from "@/lib/readiness";
import { fetchAll, supabase } from "@/lib/supabase";

type Row = { id: string; name: string; r: Readiness };
const LABEL: Record<Level, string> = { red: "Vigilar", yellow: "Atenció", none: "Pendent", away: "No ve", green: "Bé" };

async function load(today: string): Promise<{ rows: Row[]; training: boolean }> {
  const sb = supabase();
  const from = addDays(today, -14);
  const [players, well, injuries, sessions] = await Promise.all([
    fetchAll<{ id: string; display_name: string; created_at: string }>((f, t) => sb.from("profiles").select("id, display_name, created_at").eq("role", "player").order("display_name").order("id").range(f, t)),
    fetchAll<{ player_id: string; score: number; sleep: number; fatigue: number; mood: number; has_pain: boolean; sessions: { session_date: string } | { session_date: string }[] }>((f, t) =>
      sb.from("wellness").select("player_id, score, sleep, fatigue, mood, has_pain, sessions!inner(session_date)")
        .gte("sessions.session_date", from).lte("sessions.session_date", today).order("id").range(f, t)),
    fetchAll<{ player_id: string }>((f, t) => sb.from("injuries").select("player_id").lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("id").range(f, t)),
    fetchAll<{ id: string }>((f, t) => sb.from("sessions").select("id").eq("session_date", today).eq("cancelled", false).order("id").range(f, t)),
  ]);
  const notices = sessions.length
    ? await fetchAll<{ player_id: string }>((f, t) => sb.from("absence_notices").select("player_id").in("session_id", sessions.map((s) => s.id)).order("player_id").range(f, t)).catch(() => [])
    : [];
  const acwr = await loadTeamAcwr(today, players).catch(() => new Map());
  const rows: WellRow[] = well.map((w) => ({
    player_id: w.player_id, date: (Array.isArray(w.sessions) ? w.sessions[0]?.session_date : w.sessions?.session_date) ?? "",
    score: Number(w.score), sleep: w.sleep, fatigue: w.fatigue, mood: w.mood, has_pain: w.has_pain,
  })).filter((w) => w.date);
  const injured = new Set(injuries.map((i) => i.player_id));
  const away = new Set(notices.map((n) => n.player_id));
  const out = players.map((p) => {
    const mine = rows.filter((w) => w.player_id === p.id);
    const todayW = mine.filter((w) => w.date === today).sort((a, b) => a.score - b.score)[0] ?? null;
    const a = acwr.get(p.id)?.result;
    const r = readinessOf({ injured: injured.has(p.id), away: away.has(p.id), today: todayW, history: mine, acwr: a?.acwr ?? null, acwrReliable: !!a && a.days >= MIN_DAYS, date: today });
    return { id: p.id, name: p.display_name, r };
  }).sort((x, y) => LEVEL_ORDER[x.r.level] - LEVEL_ORDER[y.r.level] || x.name.localeCompare(y.name, "ca"));
  return { rows: out, training: sessions.length > 0 };
}

/** Staff: el semàfor de disponibilitat de cada jugadora avui (lesions, wellness, dolor, càrrega i tendència). */
export function ReadinessCard({ today }: { today: string }) {
  const [data, setData] = useState<{ rows: Row[]; training: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showGreen, setShowGreen] = useState(false);
  useEffect(() => {
    let alive = true;
    load(today).then((d) => alive && setData(d), (e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [today]);
  if (err) return null;
  if (!data) return <section className="card readiness"><h2 className="ico-h">🚦 Semàfor d&apos;avui</h2><p className="muted small">Calculant…</p></section>;
  const count = (l: Level) => data.rows.filter((r) => r.r.level === l).length;
  const shown = data.rows.filter((r) => r.r.level !== "green" || showGreen);
  const trends = data.rows.filter((r) => r.r.trend);
  return (
    <section className="card readiness">
      <div className="row between" style={{ alignItems: "center" }}>
        <h2 className="ico-h" style={{ margin: 0 }}>🚦 Semàfor d&apos;avui</h2>
        <span className="rd-counts">
          {(["red", "yellow", "green"] as Level[]).map((l) => <span key={l} className={`rd-dot ${l}`}>{count(l)}</span>)}
        </span>
      </div>
      <p className="muted small" style={{ margin: "4px 0 8px" }}>
        {data.training ? "Abans de l'entreno: " : "Avui no hi ha entreno. "}lesions, wellness, dolor, càrrega (ACWR) i tendència. Només ho veu el staff.
      </p>
      {trends.length > 0 && <p className="rd-trend">📉 Tendència a la baixa: <b>{trends.map((t) => t.name.split(" ")[0]).join(", ")}</b></p>}
      <ul className="rd-list">
        {shown.map((x) => (
          <li key={x.id} className={x.r.level}>
            <i className={`rd-dot ${x.r.level}`} aria-hidden="true" />
            <span className="rd-name">{x.name}</span>
            <span className="rd-why">{x.r.reasons.join(" · ") || LABEL[x.r.level]}</span>
          </li>
        ))}
      </ul>
      {count("green") > 0 && (
        <button type="button" className="linkbtn" onClick={() => setShowGreen((v) => !v)}>{showGreen ? "Amagar les que estan bé" : `+ ${count("green")} en verd`}</button>
      )}
    </section>
  );
}
