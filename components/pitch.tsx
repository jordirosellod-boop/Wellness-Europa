"use client";

import { useEffect, useState } from "react";
import { FORMATION_NAMES, FORMATIONS, hhmm, type Convocation, type RosterRow } from "@/lib/convo";
import { escapulada } from "@/lib/fonts";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/wellness";

type Kit = "home" | "away";
type Lineup = { formation: string; slots: Record<string, string>; kit: Kit };

const KIT_IMG: Record<Kit | "gk", string> = { home: "/kits/home.webp", away: "/kits/away.webp", gk: "/kits/gk.webp" };

// Posició dins del camp amb marge perquè cap samarreta ni nom en surti.
const px = (x: number) => 9 + x * 0.82;
const py = (y: number) => 92 - y * 0.95;

/**
 * Amplada màxima (en % de l'amplada del camp) de l'etiqueta d'una jugadora perquè no toqui la
 * de cap altra que estigui a la mateixa alçada.
 */
function labelRoom(spots: { x: number; y: number }[], i: number): number {
  let room = 34;
  spots.forEach((o, j) => {
    if (j !== i && Math.abs(o.y - spots[i].y) < 7) room = Math.min(room, Math.abs(px(o.x) - px(spots[i].x)) - 1.5);
  });
  return room;
}

// Amplada aproximada d'una etiqueta (lletra Escapulada a 3.1% de l'amplada del camp).
const labelWidth = (text: string) => (text.length + 1) * 1.5 + 3;

/** Nom sencer si hi cap; si no, nom + inicial del cognom; si no, només el nom. */
function fitName(name: string, dorsal: number | null, room: number): string {
  const pre = dorsal == null ? "· " : `${dorsal} `;
  const parts = name.trim().split(/\s+/);
  const options = [name, parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : name, parts[0]];
  return options.find((o) => labelWidth(pre + o) <= room) ?? parts[0];
}

/**
 * Pissarra de l'onze inicial (NOMÉS staff): camp vist de dalt, tots els sistemes i les
 * jugadores amb la samarreta oficial, el dorsal i el nom. Es posen tocant la posició i triant
 * la jugadora. Vista fixa perquè es llegeixin bé tots els noms. Tipografia Escapulada.
 */
export function LineupBoard({ c, roster }: { c: Convocation; roster: RosterRow[] }) {
  const [lineup, setLineup] = useState<Lineup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    supabase()
      .from("convocation_lineups")
      .select("formation, slots, kit")
      .eq("convocation_id", c.id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) return setError(e.message);
        setLineup((data as Lineup | null) ?? { formation: "4-4-2", slots: {}, kit: "home" });
      });
    return () => {
      alive = false;
    };
  }, [c.id]);

  const called = roster.filter((r) => r.called);
  const byId = new Map(roster.map((r) => [r.player_id, r]));

  if (error) return <p className="msg error">{error}</p>;
  if (!lineup) return <p className="muted">Carregant l&apos;onze…</p>;

  // Només compten les jugadores que encara estan convocades.
  const slots: Record<string, string> = Object.fromEntries(
    Object.entries(lineup.slots).filter(([, pid]) => byId.get(pid)?.called),
  );
  const spots = FORMATIONS[lineup.formation] ?? FORMATIONS["4-4-2"];
  const inXI = new Set(Object.values(slots));
  const bench = called.filter((r) => !inXI.has(r.player_id)).sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999));

  /** Desa al servidor i, només si ho confirma, actualitza la pissarra. */
  async function save(next: Partial<Lineup>) {
    const full = { formation: lineup!.formation, slots, kit: lineup!.kit, ...next };
    setStatus({ ok: true, text: "Desant…" });
    const { data, error: e } = await supabase()
      .from("convocation_lineups")
      .upsert({ convocation_id: c.id, ...full, updated_at: new Date().toISOString() })
      .select("formation, slots, kit")
      .maybeSingle();
    if (e || !data) return setStatus({ ok: false, text: `No s'ha pogut desar: ${e?.message ?? "torna-ho a provar"}` });
    setLineup(data as Lineup);
    setStatus({ ok: true, text: "Desat ✓" });
  }

  function place(slot: number, pid: string | null) {
    const next = { ...slots };
    const from = Object.keys(next).find((k) => next[k] === pid);
    const prev = next[String(slot)];
    if (pid) {
      // Si ja era en una altra posició, s'intercanvien.
      if (from != null) {
        if (prev) next[from] = prev;
        else delete next[from];
      }
      next[String(slot)] = pid;
    } else delete next[String(slot)];
    setPicking(null);
    save({ slots: next });
  }

  function autoFill() {
    const next = { ...slots };
    const free = [...bench];
    spots.forEach((_, i) => {
      if (!next[String(i)] && free.length) next[String(i)] = free.shift()!.player_id;
    });
    save({ slots: next });
  }

  const pickedSpot = picking != null ? spots[picking] : null;

  return (
    <section className={`card lineup ${escapulada.variable}`}>
      <div className="row between no-print">
        <h2 style={{ margin: 0 }}>Onze inicial</h2>
        <span className="chip">Només staff</span>
      </div>

      <div className="formations no-print" role="group" aria-label="Sistema de joc">
        {FORMATION_NAMES.map((f) => (
          <button key={f} type="button" aria-pressed={lineup.formation === f} onClick={() => lineup.formation !== f && save({ formation: f })}>
            {f}
          </button>
        ))}
      </div>

      <div className="kit-pick no-print" role="group" aria-label="Equipació">
        {(["home", "away"] as Kit[]).map((k) => (
          <button key={k} type="button" aria-pressed={lineup.kit === k} onClick={() => lineup.kit !== k && save({ kit: k })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={KIT_IMG[k]} alt="" width={26} height={32} />
            {k === "home" ? "1a equipació" : "2a equipació"}
          </button>
        ))}
      </div>

      <div className="row no-print" style={{ gap: 8, margin: "8px 0" }}>
        <button className="btn small" disabled={bench.length === 0 || Object.keys(slots).length >= 11} onClick={autoFill}>Omplir els buits</button>
        <button className="btn small secondary" disabled={Object.keys(slots).length === 0} onClick={() => save({ slots: {} })}>Buidar</button>
        <button className="btn small secondary" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>
      {status && <p className={`small ${status.ok ? "muted" : "msg error"} no-print`} role="status" style={{ margin: "0 0 6px" }}>{status.text}</p>}

      <div className="print-lineup">
        <div className="print-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escut.png" alt="" width={44} height={44} />
          <div>
            <b className="esc">{c.is_home ? `CE Europa – ${c.rival}` : `${c.rival} – CE Europa`}</b>
            <span>{fmtDate(c.match_date)}{c.kickoff ? ` · ${hhmm(c.kickoff)} h` : ""} · Sistema {lineup.formation} · {lineup.kit === "home" ? "1a" : "2a"} equipació</span>
          </div>
        </div>

        <div className="stadium">
          <div className="pitch">
            <svg className="pitch-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
              <g fill="none" stroke="rgba(255,255,255,.9)" strokeWidth=".45">
                <rect x="1" y="1" width="66" height="103" />
                <line x1="1" y1="52.5" x2="67" y2="52.5" />
                <circle cx="34" cy="52.5" r="9.15" />
                <rect x="13.84" y="1" width="40.32" height="16.5" />
                <rect x="24.84" y="1" width="18.32" height="5.5" />
                <rect x="13.84" y="87.5" width="40.32" height="16.5" />
                <rect x="24.84" y="98.5" width="18.32" height="5.5" />
                <rect x="30.34" y="-.6" width="7.32" height="1.6" />
                <rect x="30.34" y="104" width="7.32" height="1.6" />
                <path d="M26.7 17.5 A9.15 9.15 0 0 0 41.3 17.5" />
                <path d="M26.7 87.5 A9.15 9.15 0 0 1 41.3 87.5" />
                <path d="M1 3 A2 2 0 0 0 3 1 M65 1 A2 2 0 0 0 67 3 M1 102 A2 2 0 0 1 3 104 M65 104 A2 2 0 0 1 67 102" />
              </g>
              <g fill="rgba(255,255,255,.9)">
                <circle cx="34" cy="52.5" r=".6" /><circle cx="34" cy="12" r=".5" /><circle cx="34" cy="93" r=".5" />
              </g>
            </svg>

            {spots.map((s, i) => {
              const p = slots[String(i)] ? byId.get(slots[String(i)]) : undefined;
              const img = i === 0 ? KIT_IMG.gk : KIT_IMG[lineup.kit];
              return (
                <button
                  key={i}
                  type="button"
                  className={`pl${p ? " filled" : ""}${picking === i ? " picking" : ""}`}
                  style={{ left: `${px(s.x)}%`, top: `${py(s.y)}%` }}
                  onClick={() => setPicking(i)}
                  aria-label={p ? `${s.label}: ${p.display_name}. Canviar` : `${s.label}: posar jugadora`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="pl-shirt" src={img} alt="" draggable={false} />
                  <span className="pl-label esc">
                    {p ? (
                      <>
                        <b>{p.dorsal ?? "·"}</b> {fitName(p.display_name, p.dorsal, labelRoom(spots, i))}
                      </>
                    ) : (
                      <>+ {s.label}</>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="stadium-hint no-print">Toca una samarreta o un cercle per posar-hi una jugadora</p>
        </div>

        <div className="bench">
          <h3 className="esc">Suplents <span>{bench.length}</span></h3>
          {bench.length === 0 ? (
            <p className="muted small">{called.length === 0 ? "Primer convoca les jugadores." : "Totes les convocades són a l'onze."}</p>
          ) : (
            <ul>
              {bench.map((r) => (
                <li key={r.player_id} className="esc"><b>{r.dorsal ?? "·"}</b> {r.display_name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {picking != null && pickedSpot && (
        <div className="picker-backdrop no-print" onClick={() => setPicking(null)}>
          <div className={`picker ${escapulada.variable}`} role="dialog" aria-label={`Triar jugadora per a ${pickedSpot.label}`} onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <b>Posició: {pickedSpot.label}</b>
              <button className="btn small secondary" onClick={() => setPicking(null)}>Tancar</button>
            </div>
            {called.length === 0 && <p className="muted">No hi ha cap jugadora convocada.</p>}
            <ul>
              {[...called].sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999)).map((r) => {
                const at = Object.keys(slots).find((k) => slots[k] === r.player_id);
                return (
                  <li key={r.player_id}>
                    <button type="button" className={`pick esc${slots[String(picking)] === r.player_id ? " current" : ""}`} onClick={() => place(picking, r.player_id)}>
                      <b>{r.dorsal ?? "·"}</b> {r.display_name}
                      {at != null && <small> · {spots[Number(at)]?.label ?? "onze"}</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {slots[String(picking)] && (
              <button className="btn small secondary block" onClick={() => place(picking, null)}>Treure d&apos;aquesta posició</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
