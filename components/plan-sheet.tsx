"use client";

// Full de la sessió d'entrenament (el mateix del PDF). El fa servir la plantilla (per imprimir i fer el PDF)
// i la pantalla de les jugadores (l'entreno penjat a l'app).

import { useEffect, useRef, type ReactNode } from "react";
import { Crest } from "@/components/crest";
import { DrillView } from "@/components/drill-editor";
import { reasonLabel } from "@/lib/attendance";
import { POSITIONS, SQUAD_NAMES, STATUS_LABEL, type Plan, type PlayerStatus, type Position, type Squad, type Team } from "@/lib/plan";
import { fmtDate, type Profile } from "@/lib/wellness";

export type Roster = { players: Profile[]; positions: Map<string, Position>; nicks: Map<string, string> };

/** Com surt a l'entreno: el sobrenom, si en té; si no, el primer nom. */
export const shortName = (r: Roster, p: Profile) => r.nicks.get(p.id) ?? p.display_name.split(" ")[0];

export const SQUAD_BG: Record<Team, string> = { blue: "#1452c8", red: "#d32f2f", yellow: "#f2c200", white: "#ffffff", gk: "#111111" };
export const SQUAD_FG: Record<Team, string> = { blue: "#fff", red: "#fff", yellow: "#0b1846", white: "#0b1846", gk: "#f2c200" };

/** Jugadores per posicions, amb l'estat de cadascuna i el recompte de disponibles (inclou les afegides a mà). */
export function PositionBoard({ plan, roster, onToggle, print = false }: { plan: Plan; roster: Roster; onToggle?: (pid: string) => void; print?: boolean }) {
  type Row = { id: string; name: string; pos: string; st: PlayerStatus; guest: boolean };
  const rows: Row[] = [
    ...roster.players.map((p) => ({ id: p.id, name: shortName(roster, p), pos: roster.positions.get(p.id) ?? "—", st: plan.players[p.id] ?? "disp", guest: false })),
    ...plan.guests.map((g) => ({ id: g.id, name: g.name, pos: g.pos || "—", st: g.status as PlayerStatus, guest: true })),
  ];
  const cols = [...POSITIONS, "—"] as const;
  const by = (c: string) => rows.filter((r) => r.pos === c);
  const shown = cols.filter((c) => c !== "—" || by("—").length > 0);
  return (
    <div className={`pos-board${print ? " print" : ""}`} style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
      {shown.map((c) => {
        const list = by(c);
        const avail = list.filter((r) => r.st === "disp").length;
        return (
          <div key={c} className="pos-col">
            <b className="esc">{c === "—" ? "Sense pos." : c}</b>
            {list.map((r) => {
              const cls = `pchip ${r.st}${r.guest ? " guest" : ""}`;
              const title = `${r.name} · ${STATUS_LABEL[r.st]}${r.guest ? " · afegida a mà" : ""}`;
              const inner = <>{r.name}{r.st !== "disp" && <i>{r.st === "les" ? "L" : r.st === "part" ? "P" : "B"}</i>}</>;
              return onToggle ? (
                <button key={r.id} type="button" className={cls} onClick={() => onToggle(r.id)} title={title}>{inner}</button>
              ) : (
                <span key={r.id} className={cls} title={title}>{inner}</span>
              );
            })}
            <span className="pos-count esc">{avail}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Llista de les baixes amb el motiu de cadascuna. */
export function baixes(plan: Plan, roster: Roster) {
  return [
    ...roster.players.filter((p) => plan.players[p.id] === "baixa").map((p) => ({ id: p.id, name: roster.nicks.get(p.id) ?? p.display_name })),
    ...plan.guests.filter((g) => g.status === "baixa").map((g) => ({ id: g.id, name: g.name })),
  ];
}

/** Equips en text per al full imprès. */
export function SquadLines({ squads, pool }: { squads: Squad[]; pool: Map<string, string> }) {
  return (
    <>
      {squads.map((s) => {
        const names = s.ids.map((id) => pool.get(id)).filter(Boolean);
        if (!names.length) return null;
        return (
          <p key={s.c} className="ps-squad">
            <i style={{ background: SQUAD_BG[s.c], borderColor: s.c === "white" ? "#8a93ad" : SQUAD_BG[s.c] }} />
            <b>{SQUAD_NAMES[s.c]} ({names.length})</b> {names.join(", ")}
          </p>
        );
      })}
    </>
  );
}

const MM = 96 / 25.4;
const PAGE_W = 281 * MM;
const PAGE_H = 192 * MM; // 194 mm útils, amb una mica de marge per seguretat

/** Calcula quant s'ha de reduir el full perquè hi càpiga tot en una sola pàgina. */
export function fitSheet(el: HTMLElement) {
  const fits = (k: number) => {
    el.style.width = `${PAGE_W / k}px`; // més ample i després reduït: el text ocupa menys línies
    return el.offsetHeight * k <= PAGE_H;
  };
  let k = 1;
  if (!fits(1)) {
    let lo = 0.2, hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    k = lo;
    fits(k);
  }
  el.style.setProperty("--ps-fit", String(k));
  // Si el navegador imprimeix en vertical (Safari no fa cas de la mida de pàgina), cal reduir-lo més.
  el.style.setProperty("--ps-fit-portrait", String(k * PORTRAIT));
  return k;
}
// Ample útil d'un full vertical (A4 o carta, menys marges) respecte al de l'horitzontal.
const PORTRAIT = 190 / 281;

export function PlanSheet({ plan, roster, onScreen = false }: { plan: Plan; roster: Roster; onScreen?: boolean }) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = () => sheet.current && fitSheet(sheet.current);
    window.addEventListener("beforeprint", h);
    return () => window.removeEventListener("beforeprint", h);
  }, []);
  const available = roster.players.filter((p) => (plan.players[p.id] ?? "disp") === "disp").length + plan.guests.filter((g) => g.status === "disp").length;
  // Només les disponibles (si una s'ha donat de baixa després de fer els equips, no surt).
  const names = new Map([
    ...roster.players.filter((p) => (plan.players[p.id] ?? "disp") === "disp").map((p) => [p.id, shortName(roster, p)] as [string, string]),
    ...plan.guests.filter((g) => g.status === "disp").map((g) => [g.id, g.name] as [string, string]),
  ]);
  const cell = (k: string, v: ReactNode) => (<div className="ps-cell"><span>{k}</span><b>{v || "–"}</b></div>);
  return (
    <div className={onScreen ? "plan-sheet on-screen" : "plan-sheet"} ref={sheet}>
      <header className="ps-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escut.png" alt="" width={46} height={46} />
        <div className="ps-title">
          <b className="esc">Club Esportiu Europa</b>
          <span className="esc">Juvenil C 2026/2027 · Sessió d&apos;entrenament</span>
        </div>
      </header>
      <div className="ps-top">
        <div className="ps-info">
          {cell("Dia", fmtDate(plan.plan_date))}
          {cell("Hora", plan.start_time?.slice(0, 5))}
          {cell("Sessió", plan.session_no)}
          {cell("Jornada", plan.jornada)}
          {cell("Rival", plan.rival ? <span className="team-inline" style={{ gap: 4 }}><Crest name={plan.rival} size={14} />{plan.rival}</span> : null)}
          {cell("Microcicle", plan.microcycle)}
          {cell("Mesocicle", plan.mesocycle)}
          {cell("Temps", plan.duration_min ? `${plan.duration_min}'` : "")}
          {cell("Jugadores", String(available))}
          {cell("Continguts", plan.contents.join(" · "))}
          <div className="ps-cell wide"><span>Observacions</span><b>{plan.observations || "–"}</b></div>
          <div className="ps-cell wide"><span>Puntuació</span><b>{plan.score_notes || "–"}</b></div>
          {baixes(plan, roster).length > 0 && (
            <div className="ps-cell wide"><span>Baixes</span><b>{baixes(plan, roster).map((b) => `${b.name.split(" ")[0]}${plan.reasons[b.id] ? ` (${reasonLabel(plan.reasons[b.id])})` : ""}`).join(" · ")}</b></div>
          )}
        </div>
        <PositionBoard plan={plan} roster={roster} print />
      </div>
      <div className="ps-tasks">
        {plan.tasks.map((t, i) => (
          <article key={t.id} className="ps-task">
            <div className="ps-task-head esc">
              <span>Tasca {i + 1}</span><b>{t.type || "–"}</b>
              <span>Temps</span><b>{t.time || "–"}</b>
              <span>ID</span><b>{t.code || "–"}</b>
              <span>Total</span><b>{t.total || "–"}</b>
              <span>Espai</span><b>{t.space || "–"}</b>
              <span>Porteres</span><b>{t.gks || "–"}</b>
            </div>
            <div className="ps-task-body">
              <div className="ps-text">
                {t.description && <p><b>Descripció</b>{t.description}</p>}
                {t.objective && <p><b>Objectiu</b>{t.objective}</p>}
                {t.rules && <p><b>Normes de provocació</b>{t.rules}</p>}
                {t.cues && <p><b>Consignes</b>{t.cues}</p>}
                {t.staff.some((r) => r.who || r.role) && (
                  <table className="ps-staff">
                    <tbody>
                      {t.staff.filter((r) => r.who || r.role || r.extra).map((r, j) => (
                        <tr key={j}><td>{r.who}</td><td>{r.role}</td><td>{r.extra}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="ps-draw">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.image ? <img src={t.image} alt="" /> : <DrillView d={t.diagram} />}
                {((t.squads?.length ?? 0) > 0 || t.teams) && (
                  <div className="ps-teams">
                    <p><b>Equips</b></p>
                    <SquadLines squads={t.squads ?? []} pool={names} />
                    {t.teams && <p>{t.teams}</p>}
                  </div>
                )}
                {t.scoring && <p><b>Puntuació</b>{t.scoring}</p>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
