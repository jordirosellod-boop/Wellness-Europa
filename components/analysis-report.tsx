"use client";

import { ZonePitch, type APlayer } from "@/components/analysis-stats";
import { halfOf, minuteOf, type AEvent, type AMatch } from "@/lib/analysis";
import { matchInsights } from "@/lib/analysis-insights";
import { fmtDate } from "@/lib/wellness";

/** Informe del partit per imprimir o desar en PDF (A4 vertical). */
export function MatchReport({ match, events, players }: { match: AMatch; events: AEvent[]; players: APlayer[] }) {
  const name = (id: string) => {
    const p = players.find((x) => x.id === id);
    return p ? `${p.dorsal != null ? p.dorsal + " · " : ""}${p.name}` : "—";
  };
  const actions = [...new Set(events.map((e) => e.action))];
  const count = (team: "us" | "rival", a: string, h?: 1 | 2) => events.filter((e) => e.team === team && e.action === a && (!h || halfOf(match, e.t) === h)).length;
  const okPct = (team: "us" | "rival", a: string) => {
    const r = events.filter((e) => e.team === team && e.action === a && e.result);
    return r.length ? `${Math.round((r.filter((e) => e.result === "ok").length / r.length) * 100)}%` : "–";
  };
  const insights = matchInsights(match, events, name);
  const key = events.filter((e) => ["Gol", "Xut", "Ocasió", "Targeta"].includes(e.action));
  const players_ = players
    .map((p) => ({ p, ev: events.filter((e) => e.team === "us" && e.player_id === p.id) }))
    .filter((r) => r.ev.length)
    .sort((a, b) => b.ev.length - a.ev.length);
  const usActions = actions.filter((a) => events.some((e) => e.team === "us" && e.action === a && e.player_id));
  const zones = (a: string, team: "us" | "rival") =>
    events.filter((e) => e.action === a && e.team === team && e.zx != null).map((e) => ({ x: e.zx!, y: e.zy!, color: e.color ?? "#0a2ea0", ok: e.result === "ok" ? true : e.result === "ko" ? false : null }));
  const mapActions = ["Xut", "Recuperació", "Pèrdua"].filter((a) => zones(a, "us").length);

  return (
    <div className="an-report">
      <header className="rp-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escut.png" alt="" width={54} height={54} />
        <div className="rp-title">
          <b>{match.title}</b>
          <span>{fmtDate(match.match_date)} · Informe d&apos;anàlisi · Juvenil C</span>
        </div>
        {match.goals_for != null && match.goals_against != null && <div className="rp-score">{match.goals_for}–{match.goals_against}</div>}
      </header>

      <section className="rp-block">
        <h3>Conclusions</h3>
        <ul className="rp-insights">
          {insights.map((i, k) => <li key={k} className={i.tone}>{i.text}</li>)}
        </ul>
      </section>

      <section className="rp-block">
        <h3>Nosaltres vs {match.rival || "rival"}</h3>
        <table className="rp-table">
          <thead>
            <tr><th>Acció</th><th>CE Europa</th><th>1a / 2a</th><th>Encert</th><th>{match.rival || "Rival"}</th><th>1a / 2a</th><th>Encert</th></tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a}>
                <td>{a}</td>
                <td><b>{count("us", a)}</b></td><td>{count("us", a, 1)} / {count("us", a, 2)}</td><td>{okPct("us", a)}</td>
                <td><b>{count("rival", a)}</b></td><td>{count("rival", a, 1)} / {count("rival", a, 2)}</td><td>{okPct("rival", a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {mapActions.length > 0 && (
        <section className="rp-block rp-maps">
          {mapActions.map((a) => (
            <div key={a}>
              <h4>{a} · CE Europa</h4>
              <ZonePitch points={zones(a, "us")} height={120} />
            </div>
          ))}
        </section>
      )}

      {players_.length > 0 && (
        <section className="rp-block">
          <h3>Per jugadora</h3>
          <table className="rp-table">
            <thead><tr><th>Jugadora</th><th>Total</th>{usActions.map((a) => <th key={a}>{a}</th>)}</tr></thead>
            <tbody>
              {players_.map(({ p, ev }) => (
                <tr key={p.id}>
                  <td>{p.dorsal != null ? `${p.dorsal} · ` : ""}{p.name}</td>
                  <td><b>{ev.length}</b></td>
                  {usActions.map((a) => {
                    const l = ev.filter((e) => e.action === a);
                    const r = l.filter((e) => e.result);
                    return <td key={a}>{l.length || "–"}{r.length ? ` (${r.filter((e) => e.result === "ok").length}/${r.length})` : ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {key.length > 0 && (
        <section className="rp-block">
          <h3>Accions clau</h3>
          <table className="rp-table">
            <tbody>
              {key.map((e) => (
                <tr key={e.id}>
                  <td>{minuteOf(match, e.t)}</td>
                  <td>{e.action}{e.result ? (e.result === "ok" ? " ✓" : " ✗") : ""}</td>
                  <td>{e.team === "us" ? (e.player_id ? name(e.player_id) : "CE Europa") : match.rival || "Rival"}</td>
                  <td>{e.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {match.notes && (
        <section className="rp-block">
          <h3>Notes</h3>
          <p style={{ whiteSpace: "pre-line", margin: 0 }}>{match.notes}</p>
        </section>
      )}
    </div>
  );
}
