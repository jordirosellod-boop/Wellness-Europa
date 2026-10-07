"use client";

import type { ReactNode } from "react";
import { addDays, fmtMonth, fmtShort, monthWeeks, moveAnchor, startOfWeek, WEEKDAYS_SHORT, type CalView } from "@/lib/dates";
import { fmtDate, type Session } from "@/lib/wellness";

/**
 * Estat d'una sessió al calendari. No es guarda enlloc: es calcula a partir de les respostes.
 *  programada  · encara no ha arribat el dia
 *  pendent     · ja és el dia (o ha passat) i no hi ha respostes
 *  parcial     · hi ha algunes respostes
 *  completada  · hi ha totes les respostes (wellness i RPE)
 *  cancellada  · el staff l'ha cancel·lada
 */
export type CalStatus = "programada" | "pendent" | "parcial" | "completada" | "cancellada";

export const STATUS_LABEL: Record<CalStatus, string> = {
  programada: "Programada",
  pendent: "Pendent",
  parcial: "Parcial",
  completada: "Completada",
  cancellada: "Cancel·lada",
};

export type CalItem = { session: Session; status: CalStatus };

export function StatusChip({ status }: { status: CalStatus }) {
  return <span className={`chip st-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Calendar({
  view,
  anchor,
  today,
  items,
  loading,
  onView,
  onAnchor,
  renderItem,
  dayFooter,
}: {
  view: CalView;
  anchor: string;
  today: string;
  items: CalItem[];
  loading?: boolean;
  onView: (v: CalView) => void;
  onAnchor: (d: string) => void;
  renderItem: (item: CalItem) => ReactNode;
  dayFooter?: (day: string) => ReactNode;
}) {
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) {
    const list = byDay.get(it.session.session_date) ?? [];
    list.push(it);
    byDay.set(it.session.session_date, list);
  }

  const title =
    view === "mes"
      ? fmtMonth(anchor)
      : view === "setmana"
        ? `${fmtShort(startOfWeek(anchor))} – ${fmtShort(addDays(startOfWeek(anchor), 6))}`
        : fmtDate(anchor);

  const dayList = (day: string) => {
    const list = byDay.get(day) ?? [];
    return (
      <>
        {list.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>Cap sessió.</p>
        ) : (
          <ul className="list">
            {list.map((it) => (
              <li key={it.session.id}>{renderItem(it)}</li>
            ))}
          </ul>
        )}
        {dayFooter?.(day)}
      </>
    );
  };

  return (
    <section className="card cal">
      <div className="toggle three" role="group" aria-label="Vista">
        {(["mes", "setmana", "dia"] as CalView[]).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)}>
            {v === "mes" ? "Mes" : v === "setmana" ? "Setmana" : "Dia"}
          </button>
        ))}
      </div>

      <div className="cal-nav">
        <button type="button" className="btn small secondary" aria-label="Anterior" onClick={() => onAnchor(moveAnchor(view, anchor, -1))}>‹</button>
        <div className="cal-title">
          <b>{title}</b>
          {loading && <span className="muted small"> · carregant…</span>}
        </div>
        <button type="button" className="btn small secondary" aria-label="Següent" onClick={() => onAnchor(moveAnchor(view, anchor, 1))}>›</button>
      </div>
      {anchor !== today && (
        <button type="button" className="linkbtn" onClick={() => onAnchor(today)}>Tornar a avui</button>
      )}

      {view === "mes" && (
        <>
          <div className="cal-grid">
            {WEEKDAYS_SHORT.map((d) => (
              <div key={d} className="cal-wd">{d}</div>
            ))}
            {monthWeeks(anchor).flat().map((day) => {
              const list = byDay.get(day) ?? [];
              const out = day.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <button
                  key={day}
                  type="button"
                  className={`cal-day${out ? " out" : ""}${day === today ? " today" : ""}`}
                  aria-pressed={day === anchor}
                  aria-label={`${fmtDate(day)}: ${list.length ? list.map((i) => `${i.session.name} (${STATUS_LABEL[i.status]})`).join(", ") : "cap sessió"}`}
                  onClick={() => onAnchor(day)}
                >
                  <span>{Number(day.slice(8))}</span>
                  <span className="dots">
                    {list.slice(0, 3).map((i) => (
                      <i key={i.session.id} className={`dot st-${i.status}`} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <Legend />
          <div className="cal-daypanel">
            <h3>{fmtDate(anchor)}</h3>
            {dayList(anchor)}
          </div>
        </>
      )}

      {view === "setmana" && (
        <div className="cal-week">
          {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)).map((day) => (
            <div key={day} className={`cal-weekday${day === today ? " today" : ""}`}>
              <button type="button" className="linkbtn cal-weeklabel" onClick={() => { onAnchor(day); onView("dia"); }}>
                {fmtDate(day)}
              </button>
              {dayList(day)}
            </div>
          ))}
        </div>
      )}

      {view === "dia" && <div className="cal-daypanel">{dayList(anchor)}</div>}
    </section>
  );
}

function Legend() {
  return (
    <div className="legend">
      {(Object.keys(STATUS_LABEL) as CalStatus[]).map((s) => (
        <span key={s}>
          <i className={`dot st-${s}`} /> {STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
