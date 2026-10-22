"use client";

import { useEffect, useState } from "react";
import { addDays, startOfWeek, weekRange } from "@/lib/dates";
import { bibName, fetchBibs } from "@/lib/bibs";
import { dayTitle, fetchWeeklyPlan, itemTime, type PlanDay, type WeeklyPlan } from "@/lib/weekly";
import { todayMadrid } from "@/lib/wellness";

/** Els 7 dies del planning (el d'avui destacat). */
export function WeekDays({ weekStart, days, footer, bibs }: { weekStart: string; days: PlanDay[]; footer: string | null; bibs?: Map<string, string> }) {
  const today = todayMadrid();
  return (
    <div className="wk">
      {days.map((d, i) => {
        const date = addDays(weekStart, i);
        const rest = d.rest || d.items.length === 0;
        return (
          <section key={i} className={`wk-day${date === today ? " today" : ""}${rest ? " rest" : ""}${date < today ? " past" : ""}`}>
            <h3>{dayTitle(weekStart, i)}{date === today && <span className="wk-today">Avui</span>}</h3>
            {bibs?.get(date) && <p className="wk-bibs">🦺 Petos: <b>{bibs.get(date)}</b></p>}
            {rest ? (
              <p className="wk-rest">Descans 😴</p>
            ) : (
              <ul>
                {d.items.map((it, j) => (
                  <li key={j}>
                    <span className="wk-time">{itemTime(it)}</span>
                    <span className="wk-icon" aria-hidden="true">{it.icon}</span>
                    <span className="wk-text">{it.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {footer?.trim() && <p className="wk-footer">{footer.trim()}</p>}
    </div>
  );
}

/** Pantalla de la jugadora: el planning d'aquesta setmana (i el de la que ve, si ja està publicat). */
export function PlayerPlanning() {
  const thisWeek = startOfWeek(todayMadrid());
  const [week, setWeek] = useState(thisWeek);
  const [plans, setPlans] = useState<Record<string, WeeklyPlan | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [bibs, setBibs] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchBibs(thisWeek, addDays(thisWeek, 13)).then((l) => setBibs(new Map(l.map((b) => [b.day, bibName(b)]))), () => {});
    Promise.all([fetchWeeklyPlan(thisWeek), fetchWeeklyPlan(addDays(thisWeek, 7))]).then(
      ([a, b]) => setPlans({ [thisWeek]: a, [addDays(thisWeek, 7)]: b }),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [thisWeek]);

  const loaded = thisWeek in plans;
  const plan = plans[week] ?? null;
  const next = plans[addDays(thisWeek, 7)] ?? null;

  return (
    <>
      <h1>Planning de la setmana</h1>
      <p className="muted" style={{ marginTop: -6 }}>{weekRange(week)}</p>
      {error && <p className="msg error">{error}</p>}
      {(next || week !== thisWeek) && (
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button aria-pressed={week === thisWeek} onClick={() => setWeek(thisWeek)}>Aquesta setmana</button>
          {next && <button aria-pressed={week !== thisWeek} onClick={() => setWeek(addDays(thisWeek, 7))}>La setmana que ve</button>}
        </div>
      )}
      {!loaded && !error && <p className="muted">Carregant…</p>}
      {loaded && !plan && <p className="card">El cos tècnic encara no ha publicat el planning d&apos;aquesta setmana.</p>}
      {plan && <WeekDays weekStart={plan.week_start} days={plan.days} footer={plan.footer} bibs={bibs} />}
    </>
  );
}
