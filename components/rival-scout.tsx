"use client";

import { useEffect, useState } from "react";
import { AMATCH_COLS, fetchAEvents, prettyTeam, rivalKey, type AEvent, type AMatch } from "@/lib/analysis";
import { FORMATION_NAMES } from "@/lib/convo";
import type { GroupMatch, StandingRow } from "@/lib/fcf";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, todayMadrid } from "@/lib/wellness";

type RivalData = {
  next: (GroupMatch & { is_home: boolean; rival_id: string; rival: string }) | null;
  table: StandingRow[];
  us_id: string;
  rival_matches: GroupMatch[];
  vs_us: GroupMatch[];
};

type KeyPlayer = { dorsal: string; name: string; pos: string; note: string };
type Fields = {
  system: string; system_alt: string; key_players: KeyPlayer[];
  strengths: string; weaknesses: string; pressing: string; buildup: string; transitions: string;
  abp_for: string; abp_against: string; plan: string; keys: string;
};
const EMPTY: Fields = {
  system: "", system_alt: "", key_players: [], strengths: "", weaknesses: "", pressing: "", buildup: "", transitions: "",
  abp_for: "", abp_against: "", plan: "", keys: "",
};
const TEXTS: [keyof Fields, string, string][] = [
  ["strengths", "Punts forts", "Ex.: molt verticals, bona pilota llarga a la punta"],
  ["weaknesses", "Punts febles", "Ex.: lentes en la recuperació defensiva, espai a l'esquena de les laterals"],
  ["pressing", "Com pressionen", "Ex.: pressió alta els primers 15', bloc mig després"],
  ["buildup", "Com surten amb pilota", "Ex.: la portera juga en llarg; la 6 baixa entre centrals"],
  ["transitions", "Transicions", "Ex.: contraatac ràpid per banda dreta"],
  ["abp_for", "ABP a favor (seves)", "Ex.: córners al primer pal, la 4 rematadora"],
  ["abp_against", "ABP en contra (nostres)", "Ex.: defensen en zona; espai al segon pal"],
  ["plan", "Pla de partit", "Ex.: atacar per fora, pressió a la sortida de la 6"],
  ["keys", "Claus per a les jugadores", "3-4 idees curtes per a la xerrada"],
];

async function token() {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? "";
}

/** Informe desat d'aquest rival i partit, l'anterior (per copiar-lo) i els vídeos del rival. */
async function loadScout(key: string, matchDate: string) {
  const sb = supabase();
  const { data: rows, error: e } = await sb.from("rival_scouting").select("id, match_date, fields").eq("rival_key", key).order("match_date", { ascending: false }).order("id").range(0, 9);
  if (e) throw new Error(e.message);
  const cur = (rows ?? []).find((r) => r.match_date === matchDate);
  const old = (rows ?? []).find((r) => r.match_date !== matchDate);
  const vids = await fetchAll<AMatch>((f, t) => sb.from("analysis_matches").select(AMATCH_COLS).eq("kind", "rival").order("match_date", { ascending: false }).order("id").range(f, t));
  const videos = vids.filter((v) => v.rival && rivalKey(v.rival) === key);
  const events: AEvent[] = [];
  for (const v of videos) events.push(...(await fetchAEvents(v.id)));
  return {
    rowId: (cur?.id as string | undefined) ?? null,
    fields: { ...EMPTY, ...((cur?.fields as Partial<Fields>) ?? {}) },
    prev: old ? { ...EMPTY, ...(old.fields as Partial<Fields>) } : null,
    videos,
    events,
  };
}

/** Anàlisi del proper rival (sempre el següent partit): dades de la FCF, informe i vídeos. */
export function RivalPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const [data, setData] = useState<RivalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [rowId, setRowId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [videos, setVideos] = useState<AMatch[]>([]);
  const [vEvents, setVEvents] = useState<AEvent[]>([]);
  const [prev, setPrev] = useState<Fields | null>(null);

  const rival = data?.next ? prettyTeam(data.next.rival) : "";
  const key = rival ? rivalKey(rival) : "";
  const matchDate = data?.next?.kickoff?.slice(0, 10) ?? todayMadrid();

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/fcf/rival", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setData(json as RivalData);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    loadScout(key, matchDate).then(
      (d) => {
        if (!alive) return;
        setRowId(d.rowId);
        setFields(d.fields);
        setPrev(d.prev);
        setVideos(d.videos);
        setVEvents(d.events);
      },
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [key, matchDate]);

  const set = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
    setDirty(true);
    setMsg(null);
  };

  async function save() {
    const sb = supabase();
    const row = { rival_key: key, rival_name: rival, match_date: matchDate, fields };
    const { data: d, error: e } = rowId
      ? await sb.from("rival_scouting").update(row).eq("id", rowId).select("id").maybeSingle()
      : await sb.from("rival_scouting").insert(row).select("id").maybeSingle();
    if (e || !d) return setMsg({ ok: false, text: `No s'ha pogut desar: ${e?.message ?? ""}` });
    setRowId(d.id as string);
    setDirty(false);
    setMsg({ ok: true, text: "Informe del rival desat ✓" });
  }

  async function newVideo() {
    const { data: d, error: e } = await supabase()
      .from("analysis_matches")
      .insert({ kind: "rival", title: `Scouting · ${rival}`, match_date: todayMadrid(), rival })
      .select("id")
      .maybeSingle();
    if (e || !d) return setMsg({ ok: false, text: `No s'ha pogut crear: ${e?.message ?? ""}` });
    onOpen(d.id as string);
  }

  if (error) return <p className="msg error">{error}</p>;
  if (!data) return <p className="muted">Llegint les dades de la FCF…</p>;
  if (!data.next) return <p className="card">No hi ha cap partit al calendari de la FCF.</p>;

  const n = data.next;
  const row = data.table.find((r) => r.team_id === n.rival_id);
  const us = data.table.find((r) => r.team_id === data.us_id);
  const kickoff = n.kickoff ? `${fmtDate(n.kickoff.slice(0, 10))} · ${n.kickoff.slice(11, 16)} h` : "Data per confirmar";
  const days = n.kickoff ? Math.round((Date.parse(`${n.kickoff.slice(0, 10)}T12:00:00Z`) - Date.parse(`${todayMadrid()}T12:00:00Z`)) / 864e5) : null;
  const res = (m: GroupMatch, teamId: string) => {
    if (m.home_goals == null || m.away_goals == null) return "";
    const mine = m.home_id === teamId ? m.home_goals : m.away_goals;
    const theirs = m.home_id === teamId ? m.away_goals : m.home_goals;
    return mine > theirs ? "G" : mine < theirs ? "P" : "E";
  };
  const actions = [...new Set(vEvents.map((e) => e.action))];

  return (
    <div className="rival">
      <section className="card rival-hero">
        <span className="rv-k">Proper partit · J{n.jornada}{days != null && days >= 0 ? ` · ${days === 0 ? "avui" : days === 1 ? "demà" : `d'aquí ${days} dies`}` : ""}</span>
        <b className="rv-name">{rival}</b>
        <span>{n.is_home ? "A casa" : "A fora"} · {kickoff}</span>
        {row && (
          <div className="rv-stats">
            <div><b>{row.pos}a</b><span>posició</span></div>
            <div><b>{row.pts}</b><span>punts</span></div>
            <div><b>{row.g}-{row.e}-{row.p}</b><span>G-E-P</span></div>
            <div><b>{row.gf}:{row.gc}</b><span>gols</span></div>
            <div><b>{row.pj ? (row.gf / row.pj).toFixed(1).replace(".", ",") : "–"}</b><span>gols/partit</span></div>
            <div className="form">{row.form.map((f, i) => <i key={i} className={f}>{f}</i>)}<span>ratxa</span></div>
          </div>
        )}
        {us && row && <p className="rv-vs">Nosaltres: {us.pos}a amb {us.pts} punts ({us.gf}:{us.gc}).</p>}
      </section>

      <div className="rival-grid">
        <section className="card">
          <h3 className="esc">Classificació</h3>
          <div className="table-wrap">
            <table className="stats-table">
              <thead><tr><th>#</th><th>Equip</th><th>PJ</th><th>Pts</th><th>DG</th></tr></thead>
              <tbody>
                {data.table.map((r) => (
                  <tr key={r.team_id} className={r.team_id === n.rival_id ? "rv-row" : r.team_id === data.us_id ? "us-row" : ""}>
                    <td>{r.pos}</td><td><span className="pname">{prettyTeam(r.team)}</span></td><td>{r.pj}</td><td><b>{r.pts}</b></td><td>{r.gf - r.gc > 0 ? "+" : ""}{r.gf - r.gc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h3 className="esc">Últims partits de {rival}</h3>
          {data.rival_matches.length === 0 ? <p className="muted">Encara no ha jugat cap partit.</p> : (
            <ul className="list rv-matches">
              {data.rival_matches.slice(0, 8).map((m) => {
                const r = res(m, n.rival_id);
                return (
                  <li key={m.acta_id}>
                    <span className="muted small">J{m.jornada}</span>
                    <span className="pname">{prettyTeam(m.home)} {m.home_goals}–{m.away_goals} {prettyTeam(m.away)}</span>
                    {r && <i className={`rbadge ${r}`}>{r}</i>}
                  </li>
                );
              })}
            </ul>
          )}
          {data.vs_us.length > 0 && (
            <>
              <h4 className="esc" style={{ margin: "10px 0 4px" }}>Contra nosaltres</h4>
              <ul className="list rv-matches">
                {data.vs_us.map((m) => (
                  <li key={m.acta_id}>
                    <span className="muted small">J{m.jornada}</span>
                    <span className="pname">{prettyTeam(m.home)} {m.closed ? `${m.home_goals}–${m.away_goals}` : "vs"} {prettyTeam(m.away)}</span>
                    {m.closed && <i className={`rbadge ${res(m, data.us_id)}`}>{res(m, data.us_id)}</i>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <div className="row between">
          <h3 className="esc" style={{ margin: 0 }}>Vídeos del rival</h3>
          <button className="btn small" onClick={newVideo}>+ Analitzar un vídeo de {rival}</button>
        </div>
        <p className="muted small">Analitza partits del rival amb les mateixes eines (etiquetes, clips, dibuix). Aquí en surt el resum.</p>
        {videos.length > 0 && (
          <ul className="list">
            {videos.map((v) => (
              <li key={v.id} className="row between">
                <span><b>{v.title}</b> <span className="muted small">· {fmtDate(v.match_date)} · {vEvents.filter((e) => e.match_id === v.id).length} accions</span></span>
                <button className="btn small secondary" onClick={() => onOpen(v.id)}>Obrir</button>
              </li>
            ))}
          </ul>
        )}
        {actions.length > 0 && (
          <div className="rv-actions">
            {actions.map((a) => (
              <span key={a} className="chip">{a}: <b>{vEvents.filter((e) => e.action === a && e.team === "us").length}</b></span>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="row between">
          <h3 className="esc" style={{ margin: 0 }}>Informe del rival</h3>
          {prev && !rowId && (
            <button className="btn small secondary" onClick={() => { setFields(prev); setDirty(true); }}>Copiar l&apos;informe anterior</button>
          )}
        </div>
        <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="field">Sistema habitual</label>
            <select value={fields.system} onChange={(e) => set({ system: e.target.value })}>
              <option value="">—</option>
              {FORMATION_NAMES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="field">Sistema alternatiu</label>
            <select value={fields.system_alt} onChange={(e) => set({ system_alt: e.target.value })}>
              <option value="">—</option>
              {FORMATION_NAMES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="field">Jugadores clau</label>
          {fields.key_players.map((k, i) => (
            <div key={i} className="row" style={{ flexWrap: "nowrap", gap: 6, marginBottom: 6 }}>
              <input type="text" inputMode="numeric" style={{ width: 52, flex: "none", padding: "8px 6px" }} maxLength={3} placeholder="Nº" value={k.dorsal} onChange={(e) => set({ key_players: fields.key_players.map((x, j) => (j === i ? { ...x, dorsal: e.target.value } : x)) })} />
              <input type="text" style={{ flex: "1 1 0", minWidth: 0 }} maxLength={40} placeholder="Nom" value={k.name} onChange={(e) => set({ key_players: fields.key_players.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input type="text" style={{ width: 64, flex: "none", padding: "8px 6px" }} maxLength={10} placeholder="Pos." value={k.pos} onChange={(e) => set({ key_players: fields.key_players.map((x, j) => (j === i ? { ...x, pos: e.target.value } : x)) })} />
              <input type="text" style={{ flex: "2 1 0", minWidth: 0 }} maxLength={120} placeholder="Com és / com parar-la" value={k.note} onChange={(e) => set({ key_players: fields.key_players.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
              <button className="an-ic" aria-label="Treure" onClick={() => set({ key_players: fields.key_players.filter((_, j) => j !== i) })}>🗑</button>
            </div>
          ))}
          <button className="btn small secondary" onClick={() => set({ key_players: [...fields.key_players, { dorsal: "", name: "", pos: "", note: "" }] })}>+ Jugadora clau</button>
        </div>
        {TEXTS.map(([k, label, ph]) => (
          <div key={k}>
            <label className="field">{label}</label>
            <textarea maxLength={1500} placeholder={ph} value={fields[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<Fields>)} />
          </div>
        ))}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" disabled={!dirty} onClick={save}>Desar</button>
          <button className="btn secondary" onClick={() => window.print()}>🖨 Desar en PDF / Imprimir</button>
          {dirty && <span className="muted small">Canvis sense desar</span>}
        </div>
        {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}
      </section>

      {/* Full per imprimir */}
      <div className="an-report scout-print">
        <header className="rp-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escut.png" alt="" width={54} height={54} />
          <div className="rp-title">
            <b>Informe del rival · {rival}</b>
            <span>J{n.jornada} · {n.is_home ? "A casa" : "A fora"} · {kickoff}</span>
          </div>
          {row && <div className="rp-score">{row.pos}a</div>}
        </header>
        {row && (
          <section className="rp-block">
            <p style={{ margin: 0 }}>{row.pts} punts · {row.g}G {row.e}E {row.p}P · gols {row.gf}:{row.gc} · ratxa {row.form.join(" ")}</p>
          </section>
        )}
        {(fields.system || fields.system_alt) && (
          <section className="rp-block"><h3>Sistema</h3><p style={{ margin: 0 }}>{fields.system}{fields.system_alt ? ` (alternatiu: ${fields.system_alt})` : ""}</p></section>
        )}
        {fields.key_players.some((k) => k.name || k.dorsal) && (
          <section className="rp-block">
            <h3>Jugadores clau</h3>
            <table className="rp-table">
              <tbody>
                {fields.key_players.filter((k) => k.name || k.dorsal).map((k, i) => (
                  <tr key={i}><td><b>{k.dorsal}</b></td><td>{k.name}</td><td>{k.pos}</td><td>{k.note}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {TEXTS.filter(([k]) => (fields[k] as string).trim()).map(([k, label]) => (
          <section key={k} className="rp-block"><h3>{label}</h3><p style={{ margin: 0, whiteSpace: "pre-line" }}>{fields[k] as string}</p></section>
        ))}
        {data.rival_matches.length > 0 && (
          <section className="rp-block">
            <h3>Últims resultats</h3>
            <table className="rp-table">
              <tbody>
                {data.rival_matches.slice(0, 6).map((m) => (
                  <tr key={m.acta_id}><td>J{m.jornada}</td><td>{prettyTeam(m.home)} {m.home_goals}–{m.away_goals} {prettyTeam(m.away)}</td><td>{res(m, n.rival_id)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
