"use client";

import { useState } from "react";
import { halfOf, type AEvent, type AMatch } from "@/lib/analysis";

export type APlayer = { id: string; name: string; dorsal: number | null };

/** Mini camp horitzontal (atacant cap a la dreta) amb punts a les zones. */
export function ZonePitch({ points, onPick, height = 150 }: { points: { x: number; y: number; color: string; ok?: boolean | null }[]; onPick?: (x: number, y: number) => void; height?: number }) {
  return (
    <svg
      className={`zone-pitch${onPick ? " pick" : ""}`}
      viewBox="0 0 100 64"
      style={{ height }}
      onClick={(e) => {
        if (!onPick) return;
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        onPick(Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10);
      }}
    >
      <rect width="100" height="64" fill="#2f9a42" />
      <g fill="none" stroke="rgba(255,255,255,.85)" strokeWidth=".4">
        <rect x="1" y="1" width="98" height="62" />
        <line x1="50" y1="1" x2="50" y2="63" />
        <circle cx="50" cy="32" r="8" />
        <rect x="1" y="14" width="15" height="36" />
        <rect x="84" y="14" width="15" height="36" />
        <line x1="33.3" y1="1" x2="33.3" y2="63" strokeDasharray="1 1.5" opacity=".5" />
        <line x1="66.6" y1="1" x2="66.6" y2="63" strokeDasharray="1 1.5" opacity=".5" />
      </g>
      <text x="98" y="62" textAnchor="end" fontSize="3" fill="rgba(255,255,255,.7)">atac →</text>
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={(p.y / 100) * 64} r={1.8} fill={p.color} stroke={p.ok === false ? "#fff" : "#0b1846"} strokeWidth={p.ok === false ? 0.6 : 0.3} opacity={0.92} />
      ))}
    </svg>
  );
}

/** Estadístiques del partit, calculades a partir de les marques. */
export function AnalysisStats({ match, events, players }: { match: AMatch; events: AEvent[]; players: APlayer[] }) {
  const actions = [...new Set(events.map((e) => e.action))];
  const [zoneAction, setZoneAction] = useState<string>("");
  const [zoneTeam, setZoneTeam] = useState<"us" | "rival">("us");
  const color = new Map(events.map((e) => [e.action, e.color ?? "#0a2ea0"]));

  const count = (f: (e: AEvent) => boolean) => events.filter(f).length;
  const pct = (a: string, team: "us" | "rival") => {
    const withRes = events.filter((e) => e.action === a && e.team === team && e.result);
    return withRes.length ? Math.round((withRes.filter((e) => e.result === "ok").length / withRes.length) * 100) : null;
  };

  // Franges de 15 minuts (per part).
  const seg = (e: AEvent) => {
    const h = halfOf(match, e.t);
    const s = h === 2 ? e.t - Number(match.h2_start) : e.t - Number(match.h1_start);
    return (h - 1) * 3 + Math.min(2, Math.floor(Math.max(0, s) / 900));
  };
  const SEGS = ["0-15'", "15-30'", "30-45'", "45-60'", "60-75'", "75-90'"];
  const segUs = SEGS.map((_, i) => count((e) => e.team === "us" && seg(e) === i));
  const segRival = SEGS.map((_, i) => count((e) => e.team === "rival" && seg(e) === i));
  const segMax = Math.max(1, ...segUs, ...segRival);

  const usActions = actions.filter((a) => events.some((e) => e.action === a && e.team === "us" && e.player_id));
  const playerRows = players
    .map((p) => ({ p, n: count((e) => e.player_id === p.id && e.team === "us") }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);

  const zonePts = events
    .filter((e) => e.zx != null && e.team === zoneTeam && (!zoneAction || e.action === zoneAction))
    .map((e) => ({ x: e.zx!, y: e.zy!, color: e.color ?? "#0a2ea0", ok: e.result === "ok" ? true : e.result === "ko" ? false : null }));
  // Terços del camp
  const thirds = [0, 1, 2].map((k) => zonePts.filter((p) => Math.min(2, Math.floor(p.x / 33.34)) === k).length);

  if (events.length === 0) return <p className="muted">Encara no hi ha cap acció marcada.</p>;

  return (
    <div className="an-stats">
      <section className="card">
        <h3 className="esc">Nosaltres vs rival</h3>
        <div className="table-wrap">
          <table className="stats-table">
            <thead><tr><th>Acció</th><th>CE Europa</th><th>% encert</th><th>{match.rival || "Rival"}</th><th>% encert</th></tr></thead>
            <tbody>
              {actions.map((a) => {
                const u = count((e) => e.action === a && e.team === "us");
                const r = count((e) => e.action === a && e.team === "rival");
                const pu = pct(a, "us");
                const pr = pct(a, "rival");
                const tot = Math.max(1, u + r);
                return (
                  <tr key={a}>
                    <td><span className="dotc" style={{ background: color.get(a) }} /> {a}</td>
                    <td><b>{u}</b><span className="vsbar"><i style={{ width: `${(u / tot) * 100}%` }} /></span></td>
                    <td>{pu == null ? "–" : `${pu}%`}</td>
                    <td><b>{r}</b></td>
                    <td>{pr == null ? "–" : `${pr}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3 className="esc">Per franges de 15&apos;</h3>
        <div className="segs">
          {SEGS.map((s, i) => (
            <div key={s} className="seg">
              <div className="bars">
                <i className="us" style={{ height: `${(segUs[i] / segMax) * 100}%` }} title={`CE Europa: ${segUs[i]}`} />
                <i className="rv" style={{ height: `${(segRival[i] / segMax) * 100}%` }} title={`Rival: ${segRival[i]}`} />
              </div>
              <span>{s}</span>
              <b>{segUs[i]}–{segRival[i]}</b>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ margin: 0 }}><span className="dotc" style={{ background: "#0a2ea0" }} /> CE Europa · <span className="dotc" style={{ background: "#d32f2f" }} /> Rival</p>
      </section>

      <section className="card">
        <h3 className="esc">Per jugadora</h3>
        {playerRows.length === 0 ? (
          <p className="muted small">Encara no hi ha accions amb jugadora.</p>
        ) : (
          <div className="table-wrap">
            <table className="stats-table">
              <thead>
                <tr><th>Jugadora</th><th>Total</th>{usActions.map((a) => <th key={a}>{a}</th>)}</tr>
              </thead>
              <tbody>
                {playerRows.map(({ p, n }) => (
                  <tr key={p.id}>
                    <td><span className="pname">{p.dorsal != null ? `${p.dorsal} · ` : ""}{p.name}</span></td>
                    <td><b>{n}</b></td>
                    {usActions.map((a) => {
                      const all = events.filter((e) => e.player_id === p.id && e.team === "us" && e.action === a);
                      const ok = all.filter((e) => e.result === "ok").length;
                      const withRes = all.filter((e) => e.result).length;
                      return <td key={a}>{all.length || "–"}{withRes ? <span className="muted small"> ({ok}/{withRes})</span> : null}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="esc">Mapa de zones</h3>
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          <select value={zoneAction} onChange={(e) => setZoneAction(e.target.value)} style={{ width: "auto" }} aria-label="Acció">
            <option value="">Totes les accions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="seg-toggle" role="group" aria-label="Equip">
            <button type="button" aria-pressed={zoneTeam === "us"} onClick={() => setZoneTeam("us")}>CE Europa</button>
            <button type="button" aria-pressed={zoneTeam === "rival"} onClick={() => setZoneTeam("rival")}>Rival</button>
          </div>
        </div>
        <ZonePitch points={zonePts} height={220} />
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          Terç defensiu {thirds[0]} · Terç mig {thirds[1]} · Terç ofensiu {thirds[2]} · Els punts amb vora blanca són errors.
        </p>
      </section>
    </div>
  );
}
