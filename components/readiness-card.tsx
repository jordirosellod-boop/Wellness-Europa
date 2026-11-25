"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadTeamAcwr } from "@/lib/acwr-data";
import { MIN_DAYS } from "@/lib/acwr";
import { addDays } from "@/lib/dates";
import { LEVEL_ORDER, readinessOf, type Level, type Readiness, type WellRow } from "@/lib/readiness";
import { fetchAll, supabase } from "@/lib/supabase";
import { useMvpIds } from "@/components/mvp";

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

/** Staff: el semàfor de disponibilitat de cada jugadora avui (lesions, wellness, dolor, càrrega i tendència). Compacte: toca un nom per veure el motiu. */
export function ReadinessCard({ today }: { today: string }) {
  const [data, setData] = useState<{ rows: Row[]; training: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const mvp = useMvpIds();
  const [showGreen, setShowGreen] = useState(false);
  useEffect(() => {
    let alive = true;
    load(today).then((d) => alive && setData(d), (e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [today]);
  if (err) return null;
  const rows = data?.rows ?? [];
  const count = (l: Level) => rows.filter((r) => r.r.level === l).length;
  const chips = rows.filter((r) => r.r.level !== "green" || showGreen);
  const sel = rows.find((r) => r.id === open) ?? null;
  return (
    <section className="card readiness" title="Lesions, wellness, dolor, càrrega (ACWR) i tendència. Només ho veu el staff.">
      <div className="rd-head">
        <b>🚦 Semàfor{data && !data.training ? " · avui no hi ha entreno" : " d'avui"}</b>
        {data ? (
          <span className="rd-counts">
            {(["red", "yellow", "green"] as Level[]).map((l) => (
              <button key={l} type="button" className={`rd-count ${l}`} aria-label={`${count(l)} ${LABEL[l]}`}
                onClick={() => l === "green" && setShowGreen((v) => !v)}>{count(l)}</button>
            ))}
          </span>
        ) : <span className="muted small">Calculant…</span>}
      </div>
      {data && (chips.length ? (
        <div className="rd-chips">
          {chips.map((x) => (
            <button key={x.id} type="button" className={`rd-chip ${x.r.level}${open === x.id ? " on" : ""}`} onClick={() => setOpen(open === x.id ? null : x.id)}>
              <i aria-hidden="true" />{mvp.has(x.id) ? "👑 " : ""}{x.name.split(" ")[0]}{x.r.trend ? " 📉" : ""}
            </button>
          ))}
        </div>
      ) : <p className="rd-ok">Totes en verd ✓</p>)}
      {sel && <p className={`rd-why-line ${sel.r.level}`}><b>{sel.name}:</b> {sel.r.reasons.join(" · ") || LABEL[sel.r.level]} <Link className="rd-360" href={`/entrenador/jugadora?id=${sel.id}`}>Fitxa 360° ›</Link></p>}
    </section>
  );
}
