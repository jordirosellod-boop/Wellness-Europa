"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

export type LeagueRow = { profile_id: string; display_name: string; points: number; prev_rank: number | null };

export async function fetchLeague(): Promise<LeagueRow[]> {
  const { data, error } = await supabase().rpc("league_table");
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueRow[];
}

export type LeagueWinner = { month: string; display_name: string; points: number };

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
          <span>{ws.map((w) => w.display_name).join(" i ")} · <b>{ws[0].points} pts</b></span>
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

/** Ordre de la classificació: més punts primer; empats per nom. */
export function sortLeague(rows: LeagueRow[]): LeagueRow[] {
  return [...rows].sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name, "ca"));
}

/** Posició amb empats (1, 2, 2, 4...). */
export function ranks(sorted: LeagueRow[]): Map<string, number> {
  const out = new Map<string, number>();
  sorted.forEach((r, i) => out.set(r.profile_id, i > 0 && sorted[i - 1].points === r.points ? out.get(sorted[i - 1].profile_id)! : i + 1));
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
  const rank = ranks(current);

  // Animació FLIP: es mesura on era cada fila i es fa lliscar fins a la seva posició nova.
  const els = useRef(new Map<string, HTMLElement>());
  const last = useRef(new Map<string, number>());
  const key = order.map((r) => `${r.profile_id}:${r.points}`).join("|");
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
      {order.map((r) => {
        const pos = rank.get(r.profile_id)!;
        const shownPos = showPrev ? r.prev_rank : pos;
        const move = !showPrev && r.prev_rank != null ? r.prev_rank - pos : null;
        return (
          <li
            key={r.profile_id}
            ref={(el) => {
              if (el) els.current.set(r.profile_id, el);
              else els.current.delete(r.profile_id);
            }}
            className={`league-row${r.profile_id === meId ? " mine" : ""}${shownPos != null && shownPos <= 3 ? ` top${shownPos}` : ""}`}
          >
            <span className="league-pos">{shownPos ?? "–"}</span>
            <span className="league-name">
              {r.display_name}
              {r.profile_id === meId && <span className="chip fet" style={{ marginLeft: 6 }}>Tu</span>}
            </span>
            {move != null && (
              <span className={`league-move ${move > 0 ? "up" : move < 0 ? "down" : "same"}`} title="Posicions guanyades o perdudes des d'ahir">
                {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "="}
              </span>
            )}
            <span className="league-pts">
              <b>{r.points}</b> <span>pts</span>
            </span>
            {actions && <span className="league-actions">{actions(r)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
