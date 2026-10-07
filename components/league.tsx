"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

export type LeagueRow = {
  profile_id: string;
  display_name: string;
  points: number;
  trainings: number;
  prev_rank: number | null;
  min_trainings: number;
};

/** Promig = punts ÷ entrenaments (null si encara no hi ha entrenaments). */
export function average(r: Pick<LeagueRow, "points" | "trainings">): number | null {
  return r.trainings > 0 ? Math.round((r.points / r.trainings) * 10000) / 10000 : null;
}

export function qualified(r: LeagueRow): boolean {
  return r.trainings >= r.min_trainings;
}

export function fmtAvg(n: number | null): string {
  return n == null ? "–" : n.toFixed(2).replace(".", ",");
}

export async function fetchLeague(): Promise<LeagueRow[]> {
  const { data, error } = await supabase().rpc("league_table");
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueRow[];
}

export type LeagueWinner = { month: string; display_name: string; points: number; trainings: number; average: number };

export async function fetchWinners(): Promise<LeagueWinner[]> {
  const { data, error } = await supabase().rpc("league_winners");
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueWinner[];
}

/** "Octubre" a partir de "2026-10-01" o de la data d'avui. */
export function monthName(d: string, withYear = false): string {
  const s = new Intl.DateTimeFormat("ca-ES", { timeZone: "UTC", month: "long", ...(withYear ? { year: "numeric" } : {}) }).format(new Date(`${d.slice(0, 7)}-01T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Lliga d'octubre", "Lliga de novembre" (apostrofació catalana). */
export function leagueTitle(d: string): string {
  const m = monthName(d).toLowerCase();
  return /^[aeiouàèéíòóú]/.test(m) ? `Lliga d'${m}` : `Lliga de ${m}`;
}

/** Dies que queden del mes (avui inclòs), a Barcelona. */
export function daysLeftInMonth(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
}

/** Historial de guanyadores de la lliga (un mes per línia; empats junts). */
export function Winners({ winners }: { winners: LeagueWinner[] }) {
  if (winners.length === 0) return <p className="muted small" style={{ margin: 0 }}>Encara no s&apos;ha acabat cap mes.</p>;
  const byMonth = new Map<string, LeagueWinner[]>();
  for (const w of winners) byMonth.set(w.month, [...(byMonth.get(w.month) ?? []), w]);
  return (
    <ul className="list">
      {[...byMonth.entries()].map(([m, ws]) => (
        <li key={m} className="row between">
          <span>
            <span className="winner-cup" aria-hidden="true">🏆</span> <b>{monthName(m, true)}</b>
          </span>
          <span>{ws.map((w) => w.display_name).join(" i ")} · promig <b>{fmtAvg(Number(ws[0].average))}</b></span>
        </li>
      ))}
    </ul>
  );
}

export async function fetchTeamLevel(): Promise<number | null> {
  const { data, error } = await supabase().from("team_settings").select("commitment_level").maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.commitment_level as number | null) ?? null;
}

/**
 * Ordre de la classificació (el mateix que la base de dades): primer les classificades
 * (mínim d'entrenaments) pel promig; en empat, més punts. Després la resta.
 */
export function sortLeague(rows: LeagueRow[]): LeagueRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(qualified(b)) - Number(qualified(a)) ||
      (average(b) ?? -1) - (average(a) ?? -1) ||
      b.points - a.points ||
      a.display_name.localeCompare(b.display_name, "ca"),
  );
}

/** Posició de les classificades, amb empats (1, 2, 2, 4...). Les no classificades no en tenen. */
export function ranks(sorted: LeagueRow[]): Map<string, number> {
  const out = new Map<string, number>();
  const q = sorted.filter(qualified);
  q.forEach((r, i) => {
    const p = q[i - 1];
    out.set(r.profile_id, p && average(p) === average(r) && p.points === r.points ? out.get(p.profile_id)! : i + 1);
  });
  return out;
}

/** Etiqueta petita amb el nivell de compromís de l'equip. */
export function LevelBadge({ level }: { level: number | null }) {
  if (!level) return null;
  return (
    <span className={`level-badge level-${level}`} title="Nivell de compromís de l'equip">
      <span className="level-bars" aria-hidden="true">
        {[1, 2, 3].map((n) => <i key={n} className={n <= level ? "on" : ""} />)}
      </span>
      Nivell {level}
    </span>
  );
}

/**
 * Classificació de la lliga. Les files es mouen amb animació quan canvia l'ordre.
 * Amb "fromPrevious", primer es mostra l'ordre d'ahir i després es mou fins al d'avui.
 */
export function LeagueTable({
  rows,
  meId,
  fromPrevious = false,
  actions,
}: {
  rows: LeagueRow[];
  meId?: string;
  fromPrevious?: boolean;
  actions?: (r: LeagueRow) => ReactNode;
}) {
  const current = sortLeague(rows);
  const hasPrev = rows.some((r) => r.prev_rank != null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [showPrev, setShowPrev] = useState(fromPrevious && hasPrev && !reduce);

  useEffect(() => {
    if (!showPrev) return;
    const t = setTimeout(() => setShowPrev(false), 700);
    return () => clearTimeout(t);
  }, [showPrev]);

  const order = showPrev
    ? [...rows].sort((a, b) => (a.prev_rank ?? 999) - (b.prev_rank ?? 999) || a.display_name.localeCompare(b.display_name, "ca"))
    : current;
  const firstUnq = showPrev ? -1 : order.findIndex((r) => !qualified(r));
  const rank = ranks(current);

  // Animació FLIP: es mesura on era cada fila i es fa lliscar fins a la seva posició nova.
  const els = useRef(new Map<string, HTMLElement>());
  const last = useRef(new Map<string, number>());
  const key = order.map((r) => `${r.profile_id}:${r.points}:${r.trainings}`).join("|");
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    els.current.forEach((el, id) => {
      const top = el.offsetTop;
      next.set(id, top);
      const before = last.current.get(id);
      if (before != null && before !== top && !reduce) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], {
          duration: 900,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
      }
    });
    last.current = next;
  }, [key, reduce]);

  if (rows.length === 0) return <p className="muted">Encara no hi ha jugadores.</p>;

  return (
    <ol className="league">
      {order.map((r, i) => {
        const pos = rank.get(r.profile_id) ?? null;
        const shownPos = showPrev ? r.prev_rank : pos;
        const move = !showPrev && r.prev_rank != null && pos != null ? r.prev_rank - pos : null;
        const avg = average(r);
        const missing = r.min_trainings - r.trainings;
        return (
          <li
            key={r.profile_id}
            ref={(el) => {
              if (el) els.current.set(r.profile_id, el);
              else els.current.delete(r.profile_id);
            }}
            className={`league-row${r.profile_id === meId ? " mine" : ""}${shownPos != null && shownPos <= 3 ? ` top${shownPos}` : ""}${!showPrev && !qualified(r) ? " unq" : ""}${i === firstUnq ? " first-unq" : ""}`}
            data-label={i === firstUnq ? `Encara no classificades · mínim ${r.min_trainings} entrenaments` : undefined}
          >
            <span className="league-pos">{shownPos ?? "–"}</span>
            <span className="league-name">
              {r.display_name}
              {r.profile_id === meId && <span className="chip fet" style={{ marginLeft: 6 }}>Tu</span>}
              <span className="league-sub">
                {r.points} pts · {r.trainings} entr.
                {!qualified(r) && <span className="league-missing"> · falten {missing}</span>}
              </span>
            </span>
            {move != null && (
              <span className={`league-move ${move > 0 ? "up" : move < 0 ? "down" : "same"}`} title="Posicions guanyades o perdudes des d'ahir">
                {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "="}
              </span>
            )}
            <span className="league-pts" title="Promig: punts ÷ entrenaments">
              <b>{fmtAvg(avg)}</b> <span>promig</span>
            </span>
            {actions && <span className="league-actions">{actions(r)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
