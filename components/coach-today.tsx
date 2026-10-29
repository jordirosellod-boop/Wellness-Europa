"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { Avatar, useAvatars } from "@/components/avatar";
import { useDorsals } from "@/components/shirt";
import { fetchNotices } from "@/lib/absence";
import { reasonLabel } from "@/lib/attendance";
import { fetchAll, supabase } from "@/lib/supabase";
import { alertsOf, bandOf, fmtSessionTime, SESSION_COLS, type Session, type Wellness } from "@/lib/wellness";

type Alert = { id: string; name: string; pain: boolean; score: number; low: { label: string; value: number }[] };
type Away = { id: string; name: string; reason: string | null; note: string | null };
type Row = { s: Session; expected: number; w: number; r: number; alerts: Alert[]; away: Away[] };

async function loadToday(today: string): Promise<Row[]> {
  const sb = supabase();
  const { data, error } = await sb.from("sessions").select(SESSION_COLS).eq("session_date", today).eq("cancelled", false)
    .order("start_time", { nullsFirst: true }).order("id").range(0, 9);
  if (error) throw new Error(error.message);
  const sessions = (data ?? []) as Session[];
  if (!sessions.length) return [];
  const ids = sessions.map((s) => s.id);
  const [players, well, rpe, att, inj, notices] = await Promise.all([
    fetchAll<{ id: string; display_name: string }>((f, t) => sb.from("profiles").select("id, display_name").eq("role", "player").order("id").range(f, t)),
    fetchAll<Wellness>((f, t) => sb.from("wellness").select("*").in("session_id", ids).order("id").range(f, t)),
    fetchAll<{ session_id: string }>((f, t) => sb.from("rpe").select("session_id").in("session_id", ids).order("id").range(f, t)),
    fetchAll<{ session_id: string; player_id: string; present: boolean }>((f, t) =>
      sb.from("attendance").select("session_id, player_id, present").in("session_id", ids).order("session_id").order("player_id").range(f, t)),
    fetchAll<{ player_id: string }>((f, t) =>
      sb.from("injuries").select("player_id").lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("id").range(f, t)),
    fetchNotices(ids).catch(() => []),
  ]);
  const name = new Map(players.map((p) => [p.id, p.display_name]));
  const injured = new Set(inj.map((i) => i.player_id));
  return sessions.map((s) => {
    const absent = new Set(att.filter((a) => a.session_id === s.id && !a.present).map((a) => a.player_id));
    const mine = notices.filter((n) => n.session_id === s.id);
    for (const n of mine) absent.add(n.player_id); // ha avisat que no vindrà: no li toca respondre
    const expected = players.filter((p) => !absent.has(p.id) && !injured.has(p.id)).length;
    const away = mine.map((n) => ({ id: n.player_id, name: name.get(n.player_id) ?? "?", reason: reasonLabel(n.reason), note: n.note }));
    const ws = well.filter((w) => w.session_id === s.id);
    const alerts = ws
      .map((w) => ({ id: w.player_id, name: name.get(w.player_id) ?? "?", pain: w.has_pain, score: Number(w.score), low: alertsOf(w) }))
      .filter((a) => a.pain || a.low.length > 0)
      .sort((a, b) => Number(b.pain) - Number(a.pain) || a.score - b.score);
    return { s, expected, w: ws.length, r: rpe.filter((x) => x.session_id === s.id).length, alerts, away };
  });
}

/** Per al staff, a dalt del calendari: l'entreno d'avui amb els wellness que arriben i qui cal mirar. */
export function CoachToday({ today }: { today: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const dorsals = useDorsals();
  const avatars = useAvatars();
  useEffect(() => {
    let alive = true;
    const load = () => loadToday(today).then((x) => alive && setRows(x), () => alive && setRows([]));
    load();
    const id = setInterval(load, 60_000); // es va omplint sol mentre arriben
    return () => { alive = false; clearInterval(id); };
  }, [today]);
  if (!rows || rows.length === 0) return null;
  return (
    <>
      {rows.map(({ s, expected, w, r, alerts, away }) => {
        const pct = expected ? Math.min(100, Math.round((w / expected) * 100)) : 0;
        return (
          <section key={s.id} className="coach-today">
            <div className="ct-top">
              <div className="ct-ring" style={{ "--p": pct } as CSSProperties} aria-label={`${w} de ${expected} wellness omplerts`}>
                <b>{w}<small>/{expected}</small></b>
                <span>wellness</span>
              </div>
              <div className="ct-info">
                <span className="ct-k">Avui · {s.kind}{s.start_time ? ` · ${fmtSessionTime(s.start_time)}` : ""}</span>
                <b className="ct-title">{s.name}</b>
                <span className="ct-sub">RPE {r}/{expected} · {pct >= 100 ? "Tothom ha respost ✓" : `Falten ${Math.max(0, expected - w)} wellness`}</span>
                <Link className="btn small ct-go" href={`/entrenador/sessio?id=${s.id}`}>Veure la sessió ›</Link>
              </div>
            </div>
            {alerts.length > 0 && (
              <ul className="ct-alerts">
                {alerts.map((a) => (
                  <li key={a.id} className={a.pain ? "pain" : bandOf(a.score).cls}>
                    <Avatar src={avatars.get(a.id)} n={dorsals.get(a.id)?.n} gk={dorsals.get(a.id)?.gk} size={26} />
                    <b>{a.name}</b>
                    <span>
                      {a.pain && "🩹 Dolor"}
                      {a.pain && a.low.length > 0 && " · "}
                      {a.low.map((l) => `${l.label} ${l.value}`).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {away.length > 0 && (
              <ul className="ct-alerts ct-away" aria-label="Han avisat que no vindran">
                {away.map((a) => (
                  <li key={a.id}>
                    <Avatar src={avatars.get(a.id)} n={dorsals.get(a.id)?.n} gk={dorsals.get(a.id)?.gk} size={26} />
                    <b>{a.name}</b>
                    <span>🙋‍♀️ No vindrà · {a.reason}{a.note ? ` · «${a.note}»` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
