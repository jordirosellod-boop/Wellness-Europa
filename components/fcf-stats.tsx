"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDateTime, friendlyError, type Profile } from "@/lib/wellness";

type Match = {
  acta_id: string; jornada: number; kickoff: string | null; home: string; away: string;
  home_goals: number | null; away_goals: number | null; is_home: boolean; closed: boolean;
};
type Player = { fcf_id: string; full_name: string; dorsal: string | null; profile_id: string | null; matches: number; starts: number; goals: number; sanctions: number };
type Appearance = { acta_id: string; fcf_id: string; titular: boolean; goals: number };
type Config = { last_sync: string | null; last_error: string | null };
type Data = { matches: Match[]; players: Player[]; apps: Appearance[]; config: Config | null; profiles: Profile[] };

async function fetchStats(withProfiles: boolean): Promise<Data> {
  const sb = supabase();
  const [matches, players, apps, cfg, profiles] = await Promise.all([
    fetchAll<Match>((f, t) => sb.from("fcf_matches").select("*").order("jornada").order("acta_id").range(f, t)),
    fetchAll<Player>((f, t) => sb.from("fcf_players").select("fcf_id, full_name, dorsal, profile_id, matches, starts, goals, sanctions").order("full_name").order("fcf_id").range(f, t)),
    fetchAll<Appearance>((f, t) => sb.from("fcf_appearances").select("acta_id, fcf_id, titular, goals").order("acta_id").order("fcf_id").range(f, t)),
    sb.from("fcf_config").select("last_sync, last_error").maybeSingle(),
    withProfiles
      ? fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").eq("role", "player").order("display_name").order("id").range(f, t))
      : Promise.resolve([] as Profile[]),
  ]);
  return { matches, players, apps, config: (cfg.data as Config) ?? null, profiles };
}

/** "PEREZ ORDOÑEZ, VERA" → "Vera Perez Ordoñez" */
export function prettyFcfName(full: string): string {
  const [surnames, given = ""] = full.split(",").map((x) => x.trim());
  const cap = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return cap(`${given} ${surnames}`.trim());
}

function shortTeam(name: string) {
  return name.replace(/,?\s+(C\.E\.|U\.E\.|C\.F\.|A\.D\.|C\.D\.)\s*/g, " ").replace(/\s+[A-Z]$/, "").trim();
}

function result(m: Match): "G" | "E" | "P" | null {
  if (!m.closed || m.home_goals == null || m.away_goals == null) return null;
  const ours = m.is_home ? m.home_goals : m.away_goals;
  const theirs = m.is_home ? m.away_goals : m.home_goals;
  return ours > theirs ? "G" : ours === theirs ? "E" : "P";
}

const RES_LABEL = { G: "Victòria", E: "Empat", P: "Derrota" } as const;
const RES_CLS = { G: "band-bo", E: "band-moderat", P: "band-baix" } as const;

export function FcfStats({ mode, meId }: { mode: "coach" | "player"; meId?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(
    () => fetchStats(mode === "coach").then(setData, (e) => setError(e instanceof Error ? e.message : String(e))),
    [mode],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function syncNow() {
    setBusy(true);
    setMsg(null);
    try {
      const { data: s } = await supabase().auth.getSession();
      const res = await fetch("/api/cron/fcf", { method: "POST", headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setMsg({ ok: true, text: `Actualitzat: ${json.closed} partits jugats, ${json.players} jugadores${json.autoLinked ? `, ${json.autoLinked} noms relacionats automàticament` : ""}.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function link(fcfId: string, profileId: string) {
    setMsg(null);
    const { data: d, error: e } = await supabase().from("fcf_players").update({ profile_id: profileId || null }).eq("fcf_id", fcfId).select("fcf_id");
    if (e || !d?.length) return setMsg({ ok: false, text: e?.message.includes("duplicate") ? "Aquesta jugadora ja està relacionada amb una altra fitxa." : friendlyError(e?.message ?? "No s'ha pogut desar.") });
    await load();
  }

  if (error) return <p className="msg error">{friendlyError(error)}</p>;
  if (!data) return <p className="muted">Carregant…</p>;

  const played = data.matches.filter((m) => result(m));
  const tally = { G: 0, E: 0, P: 0 } as Record<"G" | "E" | "P", number>;
  let gf = 0;
  let ga = 0;
  for (const m of played) {
    tally[result(m)!]++;
    gf += (m.is_home ? m.home_goals : m.away_goals) ?? 0;
    ga += (m.is_home ? m.away_goals : m.home_goals) ?? 0;
  }
  const next = data.matches.find((m) => !m.closed);
  const nameOf = new Map(data.players.map((p) => [p.fcf_id, p]));
  const ranking = [...data.players].sort((a, b) => b.goals - a.goals || b.matches - a.matches || a.full_name.localeCompare(b.full_name));
  const linkedIds = new Set(data.players.map((p) => p.profile_id).filter(Boolean));
  const unlinked = data.players.filter((p) => !p.profile_id).length;

  return (
    <>
      <h1>Estadístiques</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Primera Divisió Femení Juvenil · Grup 1 · dades de la FCF
        {data.config?.last_sync ? ` · actualitzat ${fmtDateTime(data.config.last_sync)}` : ""}
      </p>

      {mode === "coach" && (
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn" disabled={busy} onClick={syncNow}>{busy ? "Actualitzant…" : "↻ Actualitzar ara"}</button>
          {data.config?.last_error && <span className="muted small">Últim error: {data.config.last_error}</span>}
        </div>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}

      {data.matches.length === 0 ? (
        <p className="card">Encara no hi ha dades. {mode === "coach" ? "Toca «Actualitzar ara»." : "Torna-ho a mirar més tard."}</p>
      ) : (
        <>
          <section className="card">
            <h2>L&apos;equip</h2>
            <div className="stats three">
              <div className="stat">Partits<b>{played.length}</b><span className="small">{tally.G}V · {tally.E}E · {tally.P}D</span></div>
              <div className="stat">Gols a favor<b>{gf}</b></div>
              <div className="stat">Gols en contra<b>{ga}</b></div>
            </div>
            {next && (
              <p style={{ marginBottom: 0 }}>
                <b>Proper partit</b> (J{next.jornada}): {shortTeam(next.home)} – {shortTeam(next.away)}
                {next.kickoff ? ` · ${new Intl.DateTimeFormat("ca-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(new Date(`${next.kickoff}Z`))}` : ""}
              </p>
            )}
          </section>

          <section className="card">
            <h2>Jugadores</h2>
            <div className="table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Jugadora</th>
                    <th title="Partits (convocatòries a l'acta)">PJ</th>
                    <th title="Titularitats">Tit</th>
                    <th title="Gols">Gols</th>
                    <th title="Sancions (targetes)">Sanc</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((p) => {
                    const mine = mode === "player" && p.profile_id === meId;
                    return (
                      <tr key={p.fcf_id} className={mine ? "mine" : ""}>
                        <td>
                          <span className="pname">{prettyFcfName(p.full_name)}</span>
                          {p.dorsal && <span className="muted small"> · {p.dorsal}</span>}
                          {mode === "coach" && (
                            <select
                              className="link-select"
                              aria-label={`Jugadora de l'app per a ${prettyFcfName(p.full_name)}`}
                              value={p.profile_id ?? ""}
                              onChange={(e) => link(p.fcf_id, e.target.value)}
                            >
                              <option value="">— Sense relacionar —</option>
                              {data.profiles
                                .filter((x) => x.id === p.profile_id || !linkedIds.has(x.id))
                                .map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
                            </select>
                          )}
                          {mode === "player" && mine && <span className="chip fet" style={{ marginLeft: 6 }}>Tu</span>}
                        </td>
                        <td>{p.matches}</td>
                        <td>{p.starts}</td>
                        <td><b>{p.goals}</b></td>
                        <td>{p.sanctions}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {mode === "coach" && (
              <p className="muted small" style={{ marginBottom: 0 }}>
                {unlinked === 0
                  ? "Totes les jugadores de la FCF estan relacionades amb l'app."
                  : `${unlinked} fitxes de la FCF sense relacionar: tria la jugadora de l'app al desplegable.`}
                {" "}Les jugadores de l&apos;app sense fitxa: {data.profiles.filter((x) => !linkedIds.has(x.id)).map((x) => x.display_name).join(", ") || "cap"}.
              </p>
            )}
          </section>

          <section className="card">
            <h2>Partits</h2>
            <ul className="list">
              {[...data.matches].reverse().filter((m) => m.closed).map((m) => {
                const r = result(m);
                const scorers = data.apps
                  .filter((a) => a.acta_id === m.acta_id && a.goals > 0)
                  .map((a) => `${prettyFcfName(nameOf.get(a.fcf_id)?.full_name ?? "").split(" ")[0]}${a.goals > 1 ? ` (${a.goals})` : ""}`);
                return (
                  <li key={m.acta_id}>
                    <div className="row between">
                      <span>
                        <span className="muted small">J{m.jornada} · </span>
                        <b>{shortTeam(m.home)} {m.home_goals}–{m.away_goals} {shortTeam(m.away)}</b>
                      </span>
                      {r && <span className={`chip ${RES_CLS[r]}`}>{RES_LABEL[r]}</span>}
                    </div>
                    {scorers.length > 0 && <div className="muted small">⚽ {scorers.join(", ")}</div>}
                  </li>
                );
              })}
            </ul>
            <p className="muted small" style={{ marginBottom: 0 }}>
              S&apos;actualitza sola cada 6 hores quan l&apos;àrbitre tanca l&apos;acta. Font: fcf.cat.
            </p>
          </section>
        </>
      )}
    </>
  );
}
