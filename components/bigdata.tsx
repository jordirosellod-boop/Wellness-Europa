"use client";

import { useEffect, useMemo, useState } from "react";
import { AttackDefense, FormStrip, MirrorBars, PeriodBars, PositionRace } from "@/components/bigdata-charts";
import { prettyTeam, rivalKey } from "@/lib/analysis";
import { candidates, compute, needs, prettyPlayer, type BigRaw, type Candidate, type League, type PlayerStat } from "@/lib/bigdata";
import { fetchAll, supabase } from "@/lib/supabase";
import { FcfStaleNote } from "@/components/fcf-note";

type Tab = "resum" | "equips" | "jugadores" | "fitxatges" | "disciplina";
type Target = { id: string; fcf_id: string; name: string; team: string | null; status: "seguiment" | "contactar" | "descartada"; note: string | null };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f1 = (v: number) => v.toFixed(1).replace(".", ",");
const f2 = (v: number) => v.toFixed(2).replace(".", ",");

async function token() {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? "";
}

function Crest({ src, size = 22 }: { src: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className="crest crest-fallback" style={{ width: size, height: size }} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className="crest" loading="lazy" onError={() => setBroken(true)} />;
}

/** Big Data de la lliga (dades públiques de la FCF). Només el responsable. */
export function BigData() {
  const [raw, setRaw] = useState<BigRaw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>("Llegint la lliga…");
  const [tab, setTab] = useState<Tab>("resum");
  const [sel, setSel] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      // La primera vegada cal llegir totes les actes: es fa per parts fins que no en queda cap.
      for (let round = 0; round < 25 && alive; round++) {
        const res = await fetch("/api/fcf/bigdata", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
        if (!alive) return;
        setRaw(j as BigRaw);
        if (!j.pending) break;
        setLoading(`Llegint les actes de la FCF… en queden ${j.pending}`);
      }
      const t = await fetchAll<Target>((f, to) => supabase().from("scouting_targets").select("id, fcf_id, name, team, status, note").order("created_at").order("id").range(f, to));
      if (alive) setTargets(t);
    })().then(
      () => alive && setLoading(null),
      (e) => alive && (setError(e instanceof Error ? e.message : String(e)), setLoading(null)),
    );
    return () => {
      alive = false;
    };
  }, [version]);

  const L0 = useMemo(() => (raw ? compute(raw) : null), [raw]);
  // Escuts que la FCF no té (enllaç trencat): es treuen perquè als gràfics surti el cercle.
  const [bad, setBad] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!L0) return;
    for (const t of L0.teams) {
      if (!t.crest) continue;
      const img = new Image();
      img.onerror = () => setBad((b) => new Set([...b, t.crest!]));
      img.src = t.crest;
    }
  }, [L0]);
  const L = useMemo(() => (L0 && bad.size ? { ...L0, teams: L0.teams.map((t) => (t.crest && bad.has(t.crest) ? { ...t, crest: null } : t)) } : L0), [L0, bad]);

  async function follow(p: PlayerStat) {
    const { data, error: e } = await supabase().from("scouting_targets").insert({ fcf_id: p.id, name: p.name, team: p.team }).select("id, fcf_id, name, team, status, note").maybeSingle();
    if (e || !data) return setError(`No s'ha pogut afegir al seguiment: ${e?.message ?? ""}`);
    setTargets((t) => [...t, data as Target]);
  }

  if (error && !L) return <p className="msg error">{error}</p>;
  if (!L) return <p className="muted">{loading}</p>;
  const us = L.us;
  const followed = new Set(targets.map((t) => t.fcf_id));

  return (
    <div className="bd">
      <section className="bd-hero">
        <div className="bd-hero-top">
          <div>
            <span className="bd-k">Big Data · Lliga</span>
            <h1 className="bd-title">La lliga en dades</h1>
            <span className="bd-sub">{L.playedRounds} de {L.totalRounds} jornades · {L.matchesPlayed} partits · {L.players.length} jugadores analitzades</span>
          </div>
          <button className="btn small secondary bd-refresh" onClick={() => setVersion((v) => v + 1)} disabled={!!loading}>↻ Actualitzar</button>
        </div>
        <div className="bd-kpis">
          {us && <div><b>{us.pos}a</b><span>la nostra posició</span></div>}
          {us && <div><b>{us.pts}</b><span>punts · projecció {us.projected}</span></div>}
          <div><b>{f1(L.avgGoals)}</b><span>gols per partit</span></div>
          <div><b>{pct(L.homeWin)}</b><span>guanya el local</span></div>
          <div><b>{pct(L.draw)}</b><span>empats</span></div>
          <div><b>{L.teams[0]?.name.split(" ").slice(0, 2).join(" ")}</b><span>líder · {L.teams[0]?.pts} punts</span></div>
        </div>
        {loading && <p className="bd-note">{loading}</p>}
        {L.playedRounds < 5 && <p className="bd-note">Encara hi ha poques jornades: les dades guanyaran pes a mesura que avanci la lliga.</p>}
      </section>

      <div className="tabs bd-tabs">
        {(["resum", "equips", "jugadores", "fitxatges", "disciplina"] as Tab[]).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {{ resum: "Resum", equips: "Equips", jugadores: "Jugadores", fitxatges: "Fitxatges", disciplina: "Disciplina" }[t]}
          </button>
        ))}
      </div>
      {error && <p className="msg error">{error}</p>}
      <FcfStaleNote at={raw?.stale_at} />

      {tab === "resum" && <Summary L={L} sel={sel} onPick={(id) => { setSel(id); setTab("equips"); }} />}
      {tab === "equips" && <Teams L={L} raw={raw!} sel={sel ?? us?.id ?? L.teams[0]?.id ?? null} onSel={setSel} followed={followed} onFollow={follow} />}
      {tab === "jugadores" && <Players L={L} raw={raw!} followed={followed} onFollow={follow} />}
      {tab === "fitxatges" && <Signings L={L} targets={targets} setTargets={setTargets} followed={followed} onFollow={follow} onError={setError} />}
      {tab === "disciplina" && <Discipline L={L} raw={raw!} />}
      <p className="muted small" style={{ marginTop: 16 }}>Dades públiques de la Federació Catalana de Futbol (actes, golejadores i sancions). Actualitzat {new Date(raw!.updated_at).toLocaleString("ca-ES", { timeZone: "Europe/Madrid", hourCycle: "h23" })}.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Summary({ L, sel, onPick }: { L: League; sel: string | null; onPick: (id: string) => void }) {
  const us = L.us;
  return (
    <>
      <section className="card">
        <h3 className="esc bd-h">Classificació avançada</h3>
        <div className="table-wrap">
          <table className="stats-table bd-table">
            <thead>
              <tr>
                <th>#</th><th style={{ textAlign: "left" }}>Equip</th><th title="Partits jugats">PJ</th><th>Pts</th><th title="Punts per partit">P/P</th>
                <th>GF</th><th>GC</th><th>DG</th><th title="Punts a casa">Casa</th><th title="Punts a fora">Fora</th><th title="Porteria a zero">P0</th><th>Ratxa</th><th title="Projecció de punts a final de lliga">Proj.</th>
              </tr>
            </thead>
            <tbody>
              {L.teams.map((t) => (
                <tr key={t.id} className={t.id === us?.id ? "us-row" : ""} onClick={() => onPick(t.id)} style={{ cursor: "pointer" }}>
                  <td>{t.pos}</td>
                  <td style={{ textAlign: "left" }}><span className="team-inline"><Crest src={t.crest} size={20} />{t.name}</span></td>
                  <td>{t.pj}</td><td><b>{t.pts}</b></td><td>{f2(t.ppg)}</td><td>{t.gf}</td><td>{t.gc}</td><td>{t.gf - t.gc > 0 ? "+" : ""}{t.gf - t.gc}</td>
                  <td>{t.home.pts}</td><td>{t.away.pts}</td><td>{t.cleanSheets}</td><td><FormStrip form={t.form} /></td><td>{t.projected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Toca un equip per veure&apos;n el perfil complet.</p>
      </section>

      <div className="bd-grid">
        <section className="card">
          <h3 className="esc bd-h">Atac contra defensa</h3>
          <AttackDefense teams={L.teams} usId={us?.id} selId={sel} onPick={onPick} />
        </section>
        <section className="card">
          <h3 className="esc bd-h">Cursa per la classificació</h3>
          <PositionRace teams={L.teams} usId={us?.id} selId={sel} />
        </section>
      </div>

      <div className="bd-grid">
        <section className="card">
          <h3 className="esc bd-h">Quan es marquen els gols</h3>
          <PeriodBars a={us && us.pj ? us.forBy.map((v) => v / us.pj) : [0, 0, 0, 0, 0, 0]} b={L.forBy.map((v) => v / 2)} la="Nosaltres (per partit)" lb="Un equip mitjà de la lliga" />
          {us && (() => {
            const i = us.forBy.indexOf(Math.max(...us.forBy));
            const j = us.againstBy.indexOf(Math.max(...us.againstBy));
            return <p className="muted small" style={{ marginBottom: 0 }}>Marquem més en el tram <b>{["0-15'", "15-30'", "30-45'", "45-60'", "60-75'", "75-90'"][i]}</b>{us.gc ? <> i encaixem més en el <b>{["0-15'", "15-30'", "30-45'", "45-60'", "60-75'", "75-90'"][j]}</b></> : null}.</p>;
          })()}
        </section>
        <section className="card">
          <h3 className="esc bd-h">Tendències de la lliga</h3>
          <div className="bd-tiles">
            <div><b>{pct(L.homeWin)}</b><span>victòries locals</span></div>
            <div><b>{pct(L.draw)}</b><span>empats</span></div>
            <div><b>{pct(L.awayWin)}</b><span>victòries visitants</span></div>
            <div><b>{f1(L.avgGoals)}</b><span>gols per partit</span></div>
          </div>
          <h4 className="bd-h4">Resultats més repetits</h4>
          <p style={{ margin: 0 }}>{L.topResults.map((r) => `${r.r} (${r.n})`).join(" · ")}</p>
          <h4 className="bd-h4">Qui marca primer…</h4>
          <p style={{ margin: 0 }}>
            {(() => {
              const all = L.teams.reduce((a, t) => ({ n: a.n + t.scoredFirst.n, pts: a.pts + t.scoredFirst.pts }), { n: 0, pts: 0 });
              return all.n ? `…fa de mitjana ${f2(all.pts / all.n)} punts per partit.` : "Encara no hi ha prou dades.";
            })()}
            {us && us.scoredFirst.n > 0 && ` Nosaltres, quan marquem primer: ${f2(us.scoredFirst.pts / us.scoredFirst.n)} punts per partit (${us.scoredFirst.n} partits).`}
          </p>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function Teams({ L, raw, sel, onSel, followed, onFollow }: { L: League; raw: BigRaw; sel: string | null; onSel: (id: string) => void; followed: Set<string>; onFollow: (p: PlayerStat) => void }) {
  const t = L.teams.find((x) => x.id === sel) ?? L.teams[0];
  if (!t) return null;
  const squad = L.players.filter((p) => p.team_id === t.id).sort((a, b) => b.index - a.index);
  const ms = raw.matches.filter((m) => m.home_id === t.id || m.away_id === t.id).sort((a, b) => a.jornada - b.jornada);
  const sanc = raw.sanctions.filter((s) => s.team && rivalKey(s.team) === rivalKey(t.full));
  const avgGc = L.teams.reduce((a, x) => a + (x.pj ? x.gc / x.pj : 0), 0) / (L.teams.length || 1);
  const traits: string[] = [];
  if (t.pj) {
    if (t.gf / t.pj >= L.avgGf * 1.3) traits.push("Atac molt potent");
    if (t.gc / t.pj <= avgGc * 0.6) traits.push("Defensa de les millors");
    if (t.home.pj && t.away.pj && t.home.pts / t.home.pj - t.away.pts / t.away.pj >= 1) traits.push("Molt fort a casa");
    if (t.topScorer && t.topScorer.share >= 0.45) traits.push(`Depèn de ${t.topScorer.name}`);
    const late = t.forBy[4] + t.forBy[5], early = t.forBy[0] + t.forBy[1];
    if (late > early + 1) traits.push("Marca molt al final");
    if (t.againstBy[5] >= 2) traits.push("Pateix als últims minuts");
    if (t.squadUsed >= 20) traits.push("Fa moltes rotacions");
  }
  return (
    <>
      <div className="bd-crests" role="tablist" aria-label="Equips">
        {L.teams.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === t.id} title={x.name} onClick={() => onSel(x.id)}><Crest src={x.crest} size={34} /></button>
        ))}
      </div>
      <section className="card bd-team">
        <div className="bd-team-head">
          <Crest src={t.crest} size={72} />
          <div>
            <h2 className="esc" style={{ margin: 0 }}>{t.name}</h2>
            <span className="muted">{t.pos}a · {t.pts} punts · {t.g}G {t.e}E {t.p}P · {t.gf}:{t.gc}</span>
            <div style={{ marginTop: 4 }}><FormStrip form={t.form} /></div>
          </div>
        </div>
        {traits.length > 0 && <div className="bd-traits">{traits.map((x) => <span key={x} className="chip">{x}</span>)}</div>}
        <div className="bd-tiles">
          <div><b>{f2(t.ppg)}</b><span>punts per partit</span></div>
          <div><b>{t.pj ? f1(t.gf / t.pj) : "–"}</b><span>gols a favor / partit</span></div>
          <div><b>{t.pj ? f1(t.gc / t.pj) : "–"}</b><span>gols en contra / partit</span></div>
          <div><b>{t.home.pts}<small>/{t.home.pj * 3}</small></b><span>punts a casa</span></div>
          <div><b>{t.away.pts}<small>/{t.away.pj * 3}</small></b><span>punts a fora</span></div>
          <div><b>{t.cleanSheets}</b><span>porteries a zero</span></div>
          <div><b>{t.pj ? pct(t.btts / t.pj) : "–"}</b><span>marquen els dos</span></div>
          <div><b>{t.pj ? pct(t.over25 / t.pj) : "–"}</b><span>més de 2,5 gols</span></div>
          <div><b>{t.scoredFirst.n ? f2(t.scoredFirst.pts / t.scoredFirst.n) : "–"}</b><span>punts quan marca primer</span></div>
          <div><b>{t.concededFirst.n ? f2(t.concededFirst.pts / t.concededFirst.n) : "–"}</b><span>punts quan encaixa primer</span></div>
          <div><b>{t.squadUsed}</b><span>jugadores utilitzades</span></div>
          <div><b>{t.yc}<small> · {t.rc}</small></b><span>grogues · vermelles</span></div>
        </div>
        <h4 className="bd-h4">Gols per franja</h4>
        <MirrorBars forBy={t.forBy} againstBy={t.againstBy} />
      </section>

      <div className="bd-grid">
        <section className="card">
          <h3 className="esc bd-h">Plantilla (per índex)</h3>
          <PlayerTable list={squad} followed={followed} onFollow={onFollow} compact />
        </section>
        <section className="card">
          <h3 className="esc bd-h">Partits</h3>
          <ul className="list bd-matches">
            {ms.map((m) => {
              const home = m.home_id === t.id;
              const r = m.closed ? (home ? Math.sign((m.home_goals ?? 0) - (m.away_goals ?? 0)) : Math.sign((m.away_goals ?? 0) - (m.home_goals ?? 0))) : null;
              return (
                <li key={m.acta_id}>
                  <span className="muted small">J{m.jornada}</span>
                  <span className="pname">{prettyTeam(m.home)} {m.closed ? `${m.home_goals}–${m.away_goals}` : "vs"} {prettyTeam(m.away)}</span>
                  {r != null && <i className={`rbadge ${r > 0 ? "G" : r < 0 ? "P" : "E"}`}>{r > 0 ? "G" : r < 0 ? "P" : "E"}</i>}
                </li>
              );
            })}
          </ul>
          {sanc.length > 0 && (
            <>
              <h4 className="bd-h4">Sancions</h4>
              <ul className="list">{sanc.map((s, i) => <li key={i}><b>{prettyPlayer(s.name)}</b> <span className="muted small">· J{s.jornada} · {s.matches} {s.matches === 1 ? "partit" : "partits"}</span></li>)}</ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

type SortKey = "index" | "goals" | "goalsPerCall" | "share" | "startRate" | "yc";
function PlayerTable({ list, followed, onFollow, compact = false }: { list: PlayerStat[]; followed: Set<string>; onFollow: (p: PlayerStat) => void; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="stats-table bd-table">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Jugadora</th>{!compact && <th style={{ textAlign: "left" }}>Equip</th>}
            <th title="Índex de rendiment (0-100)">Índex</th><th title="Partits a l'acta">PJ</th><th title="Titular">Tit.</th><th>Gols</th><th title="Gols per partit">G/P</th>
            {!compact && <th title="Percentatge dels gols del seu equip">% equip</th>}<th title="Grogues · vermelles">🟨🟥</th><th />
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td style={{ textAlign: "left" }}><span className="pname"><span className="bd-dorsal">{p.dorsal}</span>{p.name}{p.gk && <span className="chip" style={{ marginLeft: 4 }}>POR</span>}</span></td>
              {!compact && <td style={{ textAlign: "left" }}><span className="team-inline"><Crest src={p.crest} size={16} />{p.team.split(" ").slice(0, 2).join(" ")}</span></td>}
              <td><span className={`bd-index ${p.index >= 75 ? "hi" : p.index >= 55 ? "mid" : ""}`}>{p.index}</span></td>
              <td>{p.calls}</td><td>{p.starts}</td><td><b>{p.goals}</b></td><td>{f2(p.goalsPerCall)}</td>
              {!compact && <td>{p.goals ? pct(p.share) : "–"}</td>}
              <td>{p.yc}·{p.rc}</td>
              <td>{followed.has(p.id) ? <span title="En seguiment">★</span> : <button className="an-ic" title="Afegir a seguiment" aria-label={`Seguir ${p.name}`} onClick={() => onFollow(p)}>☆</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Players({ L, raw, followed, onFollow }: { L: League; raw: BigRaw; followed: Set<string>; onFollow: (p: PlayerStat) => void }) {
  const [team, setTeam] = useState("");
  const [q, setQ] = useState("");
  const [gk, setGk] = useState(false);
  const [sort, setSort] = useState<SortKey>("index");
  const [minPj, setMinPj] = useState(1);
  const list = L.players
    .filter((p) => (!team || p.team_id === team) && (!gk || p.gk) && p.calls >= minPj && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b[sort] as number) - (a[sort] as number) || b.index - a.index)
    .slice(0, 150);
  const top = L.players.filter((p) => p.calls >= Math.min(2, L.playedRounds)).slice(0, 3);
  return (
    <>
      <div className="bd-podium">
        {top.map((p, i) => (
          <div key={p.id} className={`bd-star s${i + 1}`}>
            <span className="bd-rank">{i + 1}</span>
            <Crest src={p.crest} size={40} />
            <b>{p.name}</b>
            <span>{p.team.split(" ").slice(0, 2).join(" ")}</span>
            <span className="bd-star-index">{p.index}</span>
            <small>{p.gk ? `${p.gkCleanSheets} porteries a zero` : `${p.goals} gols · ${p.starts} titularitats`}</small>
          </div>
        ))}
      </div>
      <section className="card">
        <h3 className="esc bd-h">Màximes golejadores (oficial FCF)</h3>
        <ol className="bd-scorers">
          {raw.scorers.slice(0, 10).map((s) => (
            <li key={s.id}>
              <span className="team-inline">{s.crest && <Crest src={`/api/fcf/crest?f=${encodeURIComponent(s.crest)}`} size={18} />}<b>{prettyPlayer(s.name)}</b></span>
              <span className="muted small">{prettyTeam(s.team)}</span>
              <b className="bd-goals">{s.goals}</b>
            </li>
          ))}
        </ol>
      </section>
      <section className="card">
        <h3 className="esc bd-h">Totes les jugadores</h3>
        <div className="bd-filters">
          <input type="text" placeholder="Cerca per nom" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cercar jugadora" />
          <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Equip">
            <option value="">Tots els equips</option>
            {L.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar per">
            <option value="index">Índex</option><option value="goals">Gols</option><option value="goalsPerCall">Gols per partit</option>
            <option value="share">% dels gols de l&apos;equip</option><option value="startRate">Titularitats</option><option value="yc">Targetes</option>
          </select>
          <select value={minPj} onChange={(e) => setMinPj(Number(e.target.value))} aria-label="Mínim de partits">
            {[1, 2, 3, 5, 8].map((n) => <option key={n} value={n}>Mín. {n} {n === 1 ? "partit" : "partits"}</option>)}
          </select>
          <label className="small"><input type="checkbox" checked={gk} onChange={(e) => setGk(e.target.checked)} /> Només porteres</label>
        </div>
        <PlayerTable list={list} followed={followed} onFollow={onFollow} />
        <p className="muted small" style={{ marginBottom: 0 }}>
          Índex (0-100): titularitats, gols per partit, pes en els gols del seu equip i nivell de l&apos;equip; a les porteres, porteries a zero i gols encaixats.
          Les actes no diuen la posició ni els minuts jugats.
        </p>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function Signings({ L, targets, setTargets, followed, onFollow, onError }: {
  L: League; targets: Target[]; setTargets: (f: (t: Target[]) => Target[]) => void; followed: Set<string>; onFollow: (p: PlayerStat) => void; onError: (e: string) => void;
}) {
  const ns = needs(L);
  const cands = candidates(L);
  const profiles = [...new Set(cands.map((c) => c.profile))];
  const byId = new Map(L.players.map((p) => [p.id, p]));
  async function upd(t: Target, patch: Partial<Target>) {
    const { data, error } = await supabase().from("scouting_targets").update(patch).eq("id", t.id).select("id").maybeSingle();
    if (error || !data) return onError(`No s'ha pogut desar: ${error?.message ?? ""}`);
    setTargets((list) => list.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
  }
  async function remove(t: Target) {
    if (!window.confirm(`Treure ${t.name} del seguiment?`)) return;
    const { data, error } = await supabase().from("scouting_targets").delete().eq("id", t.id).select("id");
    if (error || !data?.length) return onError(`No s'ha pogut treure: ${error?.message ?? ""}`);
    setTargets((list) => list.filter((x) => x.id !== t.id));
  }
  return (
    <>
      <section className="card bd-needs">
        <h3 className="esc bd-h">Què necessitem</h3>
        <div className="bd-need-list">
          {ns.map((n) => <div key={n.key}><b>{n.title}</b><span>{n.why}</span></div>)}
        </div>
      </section>
      {profiles.map((pr) => (
        <section key={pr} className="card">
          <h3 className="esc bd-h">{pr}</h3>
          <div className="bd-cands">
            {cands.filter((c) => c.profile === pr).map((c: Candidate) => (
              <article key={`${pr}-${c.p.id}`} className="bd-cand">
                <div className="bd-cand-head">
                  <Crest src={c.p.crest} size={34} />
                  <div><b>{c.p.name}</b><span className="muted small">{c.p.team} · dorsal {c.p.dorsal}</span></div>
                  <span className={`bd-index ${c.p.index >= 75 ? "hi" : c.p.index >= 55 ? "mid" : ""}`}>{c.p.index}</span>
                </div>
                <ul>{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                {followed.has(c.p.id) ? <span className="chip fet">★ En seguiment</span> : <button className="btn small secondary" onClick={() => onFollow(c.p)}>☆ Fer seguiment</button>}
              </article>
            ))}
          </div>
        </section>
      ))}
      <section className="card">
        <h3 className="esc bd-h">La meva llista de seguiment</h3>
        {targets.length === 0 && <p className="muted">Toca ☆ a qualsevol jugadora per afegir-la aquí.</p>}
        <ul className="list bd-targets">
          {targets.map((t) => {
            const p = byId.get(t.fcf_id);
            return (
              <li key={t.id}>
                <div className="row between" style={{ gap: 6 }}>
                  <span className="team-inline"><Crest src={p?.crest ?? null} size={22} /><b>{t.name}</b> <span className="muted small">{t.team}{p ? ` · índex ${p.index} · ${p.goals} gols · ${p.starts} tit.` : ""}</span></span>
                  <span className="row" style={{ gap: 6 }}>
                    <select value={t.status} onChange={(e) => upd(t, { status: e.target.value as Target["status"] })} aria-label="Estat">
                      <option value="seguiment">En seguiment</option><option value="contactar">Per contactar</option><option value="descartada">Descartada</option>
                    </select>
                    <button className="an-ic" aria-label="Treure" onClick={() => remove(t)}>🗑</button>
                  </span>
                </div>
                <input type="text" maxLength={500} placeholder="Nota (opcional)" defaultValue={t.note ?? ""} onBlur={(e) => (e.target.value || null) !== t.note && upd(t, { note: e.target.value || null })} aria-label={`Nota sobre ${t.name}`} />
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function Discipline({ L, raw }: { L: League; raw: BigRaw }) {
  const teams = [...L.teams].sort((a, b) => b.yc + b.rc * 3 - (a.yc + a.rc * 3));
  const carded = [...L.players].filter((p) => p.yc + p.rc).sort((a, b) => b.yc + b.rc * 3 - (a.yc + a.rc * 3)).slice(0, 15);
  const lastJ = Math.max(0, ...raw.sanctions.map((s) => s.jornada));
  return (
    <div className="bd-grid">
      <section className="card">
        <h3 className="esc bd-h">Equips més amonestats</h3>
        <ul className="list">
          {teams.map((t) => (
            <li key={t.id} className="row between">
              <span className="team-inline"><Crest src={t.crest} size={20} />{t.name}</span>
              <span><span className="bd-card y" aria-label="grogues" /> {t.yc} <span className="bd-card r" aria-label="vermelles" /> {t.rc}</span>
            </li>
          ))}
        </ul>
        <h4 className="bd-h4">Jugadores amb més targetes</h4>
        <ul className="list">
          {carded.map((p) => (
            <li key={p.id} className="row between">
              <span className="team-inline"><Crest src={p.crest} size={16} />{p.name} <span className="muted small">{p.team.split(" ").slice(0, 2).join(" ")}</span></span>
              <span><span className="bd-card y" /> {p.yc} <span className="bd-card r" /> {p.rc}</span>
            </li>
          ))}
        </ul>
        <p className="muted small" style={{ marginBottom: 0 }}>Targetes llegides de les actes.</p>
      </section>
      <section className="card">
        <h3 className="esc bd-h">Sancions (oficial FCF)</h3>
        {raw.sanctions.length === 0 && <p className="muted">Cap sanció publicada.</p>}
        <ul className="list">
          {[...raw.sanctions].sort((a, b) => b.jornada - a.jornada).map((s, i) => (
            <li key={i}>
              <div className="row between"><b>{prettyPlayer(s.name)}</b>{s.jornada === lastJ && <span className="chip pendent">Última jornada</span>}</div>
              <div className="muted small">{s.team ? prettyTeam(s.team) : ""} · J{s.jornada} · {s.matches} {s.matches === 1 ? "partit" : "partits"} de sanció</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

