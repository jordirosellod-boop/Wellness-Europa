"use client";

import { Crest } from "@/components/crest";
import { useEffect, useState } from "react";
import { fetchAEvents, type AEvent, type AMatch } from "@/lib/analysis";
import { fetchAll, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/wellness";
import { Empty } from "@/components/empty";

type Data = { matches: AMatch[]; events: Map<string, AEvent[]>; players: Map<string, string> };

/** Temporada: compara partits i fa el resum de cada jugadora a partir de totes les anàlisis. */
export function AnalysisSeason({ matches }: { matches: AMatch[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string>("");

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const evs = new Map<string, AEvent[]>();
      for (const m of matches) evs.set(m.id, await fetchAEvents(m.id));
      const ps = await fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").eq("role", "player").order("display_name").order("id").range(f, t));
      setData({ matches: [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date)), events: evs, players: new Map(ps.map((p) => [p.id, p.display_name])) });
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [matches]);

  if (error) return <p className="msg error">{error}</p>;
  if (!data) return <p className="muted">Carregant la temporada…</p>;
  if (data.matches.length === 0) return <Empty art="video" title="Encara no hi ha cap partit analitzat" hint="Puja el vídeo d&apos;un partit i marca-hi les accions." />;

  const all = [...data.events.values()].flat();
  const actions = [...new Set(all.map((e) => e.action))];
  const sel = action || actions[0] || "";
  const perMatch = data.matches.map((m) => {
    const ev = data.events.get(m.id) ?? [];
    return { m, us: ev.filter((e) => e.team === "us" && e.action === sel).length, rv: ev.filter((e) => e.team === "rival" && e.action === sel).length };
  });
  const max = Math.max(1, ...perMatch.map((x) => Math.max(x.us, x.rv)));

  // Resum per jugadora: totals i mitjana per partit en què surt.
  const playerIds = [...new Set(all.filter((e) => e.team === "us" && e.player_id).map((e) => e.player_id!))];
  const rows = playerIds
    .map((pid) => {
      const ev = all.filter((e) => e.team === "us" && e.player_id === pid);
      const played = new Set(ev.map((e) => e.match_id)).size;
      return { pid, ev, played };
    })
    .sort((a, b) => b.ev.length - a.ev.length);
  const cols = actions.filter((a) => all.some((e) => e.team === "us" && e.action === a && e.player_id)).slice(0, 8);

  const totals = (team: "us" | "rival") => actions.map((a) => all.filter((e) => e.team === team && e.action === a).length);

  return (
    <div className="an-season">
      <section className="card">
        <h3 className="esc">Temporada · {data.matches.length} partits analitzats</h3>
        <div className="table-wrap">
          <table className="stats-table">
            <thead><tr><th>Partit</th><th>Res.</th>{actions.slice(0, 7).map((a) => <th key={a}>{a}</th>)}</tr></thead>
            <tbody>
              {data.matches.map((m) => {
                const ev = data.events.get(m.id) ?? [];
                return (
                  <tr key={m.id}>
                    <td><span className="pname team-inline"><Crest name={m.rival} size={18} />{m.match_date.slice(8, 10)}/{m.match_date.slice(5, 7)} {m.rival ?? m.title}</span></td>
                    <td>{m.goals_for != null && m.goals_against != null ? `${m.goals_for}–${m.goals_against}` : "–"}</td>
                    {actions.slice(0, 7).map((a) => (
                      <td key={a}>{ev.filter((e) => e.team === "us" && e.action === a).length}<span className="muted small">/{ev.filter((e) => e.team === "rival" && e.action === a).length}</span></td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td><b>Total</b></td><td />
                {actions.slice(0, 7).map((a, i) => <td key={a}><b>{totals("us")[i]}</b><span className="muted small">/{totals("rival")[i]}</span></td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Cada xifra: nosaltres / rival.</p>
      </section>

      <section className="card">
        <div className="row between">
          <h3 className="esc" style={{ margin: 0 }}>Evolució</h3>
          <select value={sel} onChange={(e) => setAction(e.target.value)} style={{ width: "auto" }} aria-label="Acció">
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="evo">
          {perMatch.map(({ m, us, rv }) => (
            <div key={m.id} className="evo-col" title={`${m.title}: ${us} – ${rv}`}>
              <div className="bars">
                <i className="us" style={{ height: `${(us / max) * 100}%` }} />
                <i className="rv" style={{ height: `${(rv / max) * 100}%` }} />
              </div>
              <b>{us}–{rv}</b>
              <span>{m.match_date.slice(8, 10)}/{m.match_date.slice(5, 7)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="esc">Per jugadora (temporada)</h3>
        {rows.length === 0 ? (
          <p className="muted small">Encara no hi ha accions amb jugadora.</p>
        ) : (
          <div className="table-wrap">
            <table className="stats-table">
              <thead><tr><th>Jugadora</th><th title="Partits on té accions">PJ</th><th>Total</th>{cols.map((a) => <th key={a}>{a}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ pid, ev, played }) => (
                  <tr key={pid}>
                    <td><span className="pname">{data.players.get(pid) ?? "—"}</span></td>
                    <td>{played}</td>
                    <td><b>{ev.length}</b></td>
                    {cols.map((a) => {
                      const n = ev.filter((e) => e.action === a).length;
                      return <td key={a}>{n || "–"}{n ? <span className="muted small"> ({(n / played).toFixed(1).replace(".", ",")}/p)</span> : null}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>Entre parèntesis, la mitjana per partit.</p>
      </section>
    </div>
  );
}
