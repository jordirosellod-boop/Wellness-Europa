"use client";

import { MatchLine } from "@/components/crest";
import { Shirt, useDorsals } from "@/components/shirt";
import { useCallback, useEffect, useState } from "react";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDateTime, friendlyError, type Profile } from "@/lib/wellness";
import { Loading } from "@/components/loading";
import { Empty } from "@/components/empty";
import { CountUp } from "@/components/count-up";
import { isPlayed } from "@/lib/played";

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
  const dorsals = useDorsals();
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
  if (!data) return <Loading />;

  const played = data.matches.filter((m) => result(m));
  const tally = { G: 0, E: 0, P: 0 } as Record<"G" | "E" | "P", number>;
  let gf = 0;
  let ga = 0;
  for (const m of played) {
    tally[result(m)!]++;
    gf += (m.is_home ? m.home_goals : m.away_goals) ?? 0;
    ga += (m.is_home ? m.away_goals : m.home_goals) ?? 0;
  }
  const next = data.matches.find((m) => !isPlayed(m));
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
          {data.config?.last_error && (
            <span className="muted small">{/^La FCF no deixa/.test(data.config.last_error) ? `⚠️ ${data.config.last_error}` : `Últim error: ${data.config.last_error}`}</span>
          )}
        </div>
      )}
      {mode === "coach" && <PasteFcf onSaved={load} />}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}

      {data.matches.length === 0 ? (
        <Empty art="chart" title="Encara no hi ha dades de la FCF" hint={mode === "coach" ? "Toca «Actualitzar ara»." : "Torna-ho a mirar més tard."} />
      ) : (
        <>
          <section className="card">
            <h2>L&apos;equip</h2>
            <div className="stats three">
              <div className="stat">Partits<b><CountUp value={played.length} /></b><span className="small">{tally.G}V · {tally.E}E · {tally.P}D</span></div>
              <div className="stat">Gols a favor<b><CountUp value={gf} /></b></div>
              <div className="stat">Gols en contra<b><CountUp value={ga} /></b></div>
            </div>
            {next && (
              <p style={{ marginBottom: 0 }}>
                <b>Proper partit</b> (J{next.jornada}): <MatchLine home={shortTeam(next.home)} away={shortTeam(next.away)} />
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
                          <span className="pname"><Shirt n={/^\d{1,2}$/.test(p.dorsal ?? "") ? Number(p.dorsal) : null} gk={p.profile_id ? dorsals.get(p.profile_id)?.gk : false} size={24} tone={mine ? "gold" : "home"} />{prettyFcfName(p.full_name)}</span>
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
                        <b><MatchLine home={shortTeam(m.home)} away={shortTeam(m.away)} score={`${m.home_goals}–${m.away_goals}`} /></b>
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

type Preview =
  | { kind: "acta"; jornada: number; home: string; away: string; date: string | null; time: string | null; home_goals: number | null; away_goals: number | null; finished: boolean; goals: number; players: number; ours: boolean }
  | { kind: "results"; jornades: number[]; matched: number; skipped: number; closed: number; ours: string | null };

/** Staff: enganxar l'acta copiada de la web de la FCF (resultat, data i hora reals, gols i alineacions). */
function PasteFcf({ onSaved }: { onSaved: () => Promise<unknown> | void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [prev, setPrev] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(save: boolean) {
    setBusy(true); setMsg(null);
    try {
      const { data: s } = await supabase().auth.getSession();
      const res = await fetch("/api/fcf/import", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ text, save }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
      if (!save) { setPrev(j.preview as Preview); return; }
      const p = j.preview as Preview;
      setMsg({ ok: true, text: p.kind === "results"
        ? `Desat ✓ Jornada ${p.jornades.join(", ")}: ${p.matched} partits (${p.closed} amb resultat). Enganxa la següent jornada quan vulguis.`
        : `Desat ✓ J${p.jornada}: ${p.home} ${p.home_goals ?? ""}–${p.away_goals ?? ""} ${p.away}${j.players ? ` · ${j.players} jugadores nostres` : ""}. Enganxa la següent acta quan vulguis.` });
      setText(""); setPrev(null);
      await onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button className="btn secondary block" style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>📋 Enganxar de la FCF</button>;
  return (
    <section className="card stack fcf-paste">
      <div className="row between"><h2 style={{ margin: 0 }}>📋 Enganxar de la FCF</h2><button className="btn small secondary" onClick={() => setOpen(false)}>Tancar</button></div>
      <p className="muted small" style={{ margin: 0 }}>
        A la web de la FCF, selecciona tota la pàgina, copia-la i enganxa-la aquí. Serveix:
        la pestanya <b>Resultats</b> d&apos;una jornada (data, hora i resultat de tots els partits del grup) o
        l&apos;<b>acta</b> d&apos;un partit (a més, gols i alineacions).
      </p>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setPrev(null); }} rows={7} placeholder="TEMPORADA : 2026 / 27&#10;DATA: …" disabled={busy} />
      {prev?.kind === "acta" && (
        <div className="fcf-paste-prev">
          <b>Acta · J{prev.jornada} · {prev.home} {prev.home_goals ?? "–"} – {prev.away_goals ?? "–"} {prev.away}</b>
          <span className="muted small">{prev.date ? prev.date.split("-").reverse().join("/") : "sense data"}{prev.time ? ` · ${prev.time} h` : ""} · {prev.finished ? "acabat" : "pendent"} · {prev.goals} gols · {prev.players} jugadores a l&apos;alineació</span>
        </div>
      )}
      {prev?.kind === "results" && (
        <div className="fcf-paste-prev">
          <b>Resultats · jornada {prev.jornades.join(", ")} · {prev.matched} partits ({prev.closed} amb resultat)</b>
          {prev.ours && <span className="small">Nosaltres: {prev.ours}</span>}
          {prev.skipped > 0 && <span className="muted small">{prev.skipped} partit{prev.skipped > 1 ? "s" : ""} que no són del grup (no es tenen en compte).</span>}
        </div>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
      <div className="row" style={{ gap: 6 }}>
        {!prev
          ? <button className="btn" disabled={busy || text.trim().length < 20} onClick={() => call(false)}>{busy ? "Llegint…" : "Llegir"}</button>
          : <button className="btn" disabled={busy} onClick={() => call(true)}>{busy ? "Desant…" : "✓ Desar"}</button>}
      </div>
    </section>
  );
}
