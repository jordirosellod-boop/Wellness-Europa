// Planning de la setmana: 7 dies (de dilluns a diumenge) amb les activitats de cada dia.

import { addDays } from "@/lib/dates";
import { CONVO_COLS, hhmm, type Convocation } from "@/lib/convo";
import { fetchAll, supabase } from "@/lib/supabase";
import { SESSION_COLS, type Session } from "@/lib/wellness";

export type PlanItem = { t: string; e?: string; icon: string; text: string };
export type PlanDay = { rest: boolean; items: PlanItem[] };
export type WeeklyPlan = { week_start: string; days: PlanDay[]; footer: string | null; published: boolean; published_at: string | null; updated_at: string };

export const WEEKLY_COLS = "week_start, days, footer, published, published_at, updated_at";
export const DAY_NAMES = ["Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"];
export const DEFAULT_FOOTER = "Porteu roba per dutxar-vos cada dia";
export const MAX_ITEMS = 8;
export const MAX_TEXT = 100;

/** Activitats habituals (la icona i el text de partida, que després es pot canviar). */
export const ACTIVITIES: { icon: string; text: string }[] = [
  { icon: "👕", text: "Canviades" },
  { icon: "⚽️", text: "Entrenament" },
  { icon: "💪🏻", text: "Físic" },
  { icon: "📹", text: "Anàlisi" },
  { icon: "🏟️", text: "Convocatòria" },
  { icon: "⚽️", text: "Partit vs " },
  { icon: "🧘🏻‍♀️", text: "Recuperació" },
  { icon: "📋", text: "Reunió" },
  { icon: "🚌", text: "Sortida en autocar" },
  { icon: "🍽️", text: "Dinar d'equip" },
  { icon: "🎉", text: "Activitat d'equip" },
  { icon: "🩺", text: "Fisio" },
];
export const ICONS = [...new Set([...ACTIVITIES.map((a) => a.icon), "📍", "⏰", "🏃🏻‍♀️", "🎯", "🧠", "❤️"])];

export const emptyWeek = (): PlanDay[] => Array.from({ length: 7 }, () => ({ rest: false, items: [] }));

/** Dades guardades → dies vàlids (sempre 7, i cada camp amb el tipus que toca). */
export function normalizeDays(raw: unknown): PlanDay[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: 7 }, (_, i) => {
    const d = (arr[i] ?? {}) as Partial<PlanDay>;
    const items = (Array.isArray(d.items) ? d.items : [])
      .filter((x): x is PlanItem => !!x && typeof x === "object")
      .map((x) => ({
        t: typeof x.t === "string" ? x.t.slice(0, 5) : "",
        ...(typeof x.e === "string" && x.e ? { e: x.e.slice(0, 5) } : {}),
        icon: typeof x.icon === "string" ? x.icon.slice(0, 16) : "",
        text: typeof x.text === "string" ? x.text.slice(0, MAX_TEXT) : "",
      }))
      .slice(0, MAX_ITEMS);
    return { rest: d.rest === true, items };
  });
}

/** Ordena per hora (les que no en tenen, al final). */
export const sortItems = (items: PlanItem[]) => [...items].sort((a, b) => (a.t || "99").localeCompare(b.t || "99"));

const minus = (t: string, min: number) => {
  const [h, m] = t.split(":").map(Number);
  const x = (((h * 60 + m - min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const plus = (t: string, min: number) => minus(t, -min);

/**
 * Proposta a partir del calendari i de les convocatòries d'aquella setmana:
 * entrenaments (canviades 5' abans) i partits (convocatòria al camp + partit). Els dies buits, descans.
 */
export async function draftFromCalendar(weekStart: string): Promise<PlanDay[]> {
  const sb = supabase();
  const to = addDays(weekStart, 6);
  const [sessions, convos] = await Promise.all([
    fetchAll<Session>((f, t) =>
      sb.from("sessions").select(SESSION_COLS).gte("session_date", weekStart).lte("session_date", to).eq("cancelled", false)
        .order("session_date").order("start_time", { nullsFirst: true }).order("id").range(f, t),
    ),
    fetchAll<Convocation>((f, t) =>
      sb.from("convocations").select(CONVO_COLS).gte("match_date", weekStart).lte("match_date", to).order("match_date").order("id").range(f, t),
    ),
  ]);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    const items: PlanItem[] = [];
    const dayConvos = convos.filter((c) => c.match_date === day);
    for (const c of dayConvos) {
      const place = c.venue ? ` ${c.is_home ? "a" : "al"} ${c.venue}` : "";
      if (c.meet_time) items.push({ t: hhmm(c.meet_time), icon: "🏟️", text: `Convocatòria${place}`.slice(0, MAX_TEXT) });
      items.push({ t: c.kickoff ? hhmm(c.kickoff) : "", icon: "⚽️", text: `Partit vs ${c.rival}`.slice(0, MAX_TEXT) });
    }
    for (const s of sessions.filter((x) => x.session_date === day)) {
      const t = s.start_time ? hhmm(s.start_time) : "";
      if (s.kind === "Partit") {
        if (dayConvos.length) continue; // ja surt amb la convocatòria
        items.push({ t, icon: "⚽️", text: s.name.slice(0, MAX_TEXT) });
        continue;
      }
      if (t) items.push({ t: minus(t, 5), icon: "👕", text: "Canviades" });
      items.push({ t, ...(t && s.duration_min ? { e: plus(t, s.duration_min) } : {}), icon: "⚽️", text: !s.name ? "Entrenament" : /^entren/i.test(s.name) ? s.name.slice(0, MAX_TEXT) : `Entrenament (${s.name})`.slice(0, MAX_TEXT) });
    }
    return { rest: items.length === 0, items: sortItems(items) };
  });
}

/** «Dilluns 19» */
export const dayTitle = (weekStart: string, i: number) => `${DAY_NAMES[i]} ${Number(addDays(weekStart, i).slice(8, 10))}`;

export function itemTime(it: PlanItem): string {
  if (!it.t) return "";
  return it.e ? `${it.t}h a ${it.e}h` : `${it.t}h`;
}

/** Text per enganxar al WhatsApp (amb negretes *així*). */
export function toWhatsApp(weekStart: string, days: PlanDay[], footer: string | null, extra: string[] = []): string {
  const out = ["*PLANNING DE LA SETMANA*", ""];
  days.forEach((d, i) => {
    out.push(`*${dayTitle(weekStart, i)}*`);
    if (d.rest || d.items.length === 0) out.push("• Descans😴");
    else for (const it of d.items) out.push(`• ${[itemTime(it), it.icon, it.text.trim()].filter(Boolean).join(" ")}`);
    out.push("");
  });
  if (extra.length) out.push(...extra, "");
  if (footer?.trim()) out.push(`*${footer.trim().toUpperCase()}*`);
  return out.join("\n").trim();
}

export async function fetchWeeklyPlan(weekStart: string): Promise<WeeklyPlan | null> {
  const { data, error } = await supabase().from("weekly_plans").select(WEEKLY_COLS).eq("week_start", weekStart).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...(data as WeeklyPlan), days: normalizeDays((data as WeeklyPlan).days) } : null;
}
