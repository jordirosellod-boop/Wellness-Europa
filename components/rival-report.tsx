"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loading } from "@/components/loading";
import { compute, PERIODS, type BigRaw, type TeamStat } from "@/lib/bigdata";
import { buildReport, nextRival, type RivalReport, type RPlayer } from "@/lib/rival-report";
import { reportPdf } from "@/lib/report-pdf";
import { deliverFile, safeName } from "@/lib/share-file";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtDateSmart } from "@/lib/wellness";

const n1 = (x: number) => x.toFixed(1).replace(".", ",");

/** Informe del rival: es fa sol amb les dades públiques de la FCF d'aquesta temporada. */
export function RivalReportView() {
  const [raw, setRaw] = useState<BigRaw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("equip")));
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase().auth.getSession();
      const r = await fetch("/api/fcf/report", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
      return j as BigRaw;
    })().then((r) => alive && setRaw(r), (e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, []);

  const L = useMemo(() => (raw ? compute(raw) : null), [raw]);
  const nr = useMemo(() => (raw ? nextRival(raw) : null), [raw]);
  const teamId = sel ?? nr?.id ?? null;
  const rep = useMemo(() => (L && raw && teamId ? buildReport(L, raw, teamId) : null), [L, raw, teamId]);

  if (error) return <p className="msg error">No s&apos;ha pogut fer l&apos;informe: {error}</p>;
  if (!L || !raw) return <Loading lines={6} />;

  async function pdf() {
    if (!sheet.current || !rep) return;
    setBusy(true);
    try {
      await deliverFile(await reportPdf(sheet.current, `${safeName(`Informe rival - ${rep.team.name}`)}.pdf`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rr">
      <div className="row between no-print" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <select value={teamId ?? ""} onChange={(e) => setSel(e.target.value || null)} aria-label="Equip">
          {L.teams.filter((t) => t.id !== raw.us_id).map((t) => (
            <option key={t.id} value={t.id}>{t.pos}. {t.name}{t.id === nr?.id ? " · proper rival" : ""}</option>
          ))}
        </select>
        <button className="btn small" disabled={!rep || busy} onClick={pdf}>{busy ? "Fent el PDF…" : "⬇ PDF"}</button>
      </div>
      {raw.pending > 0 && <p className="muted small no-print">Encara falten {raw.pending} actes per llegir de la FCF: torna a obrir l&apos;informe d&apos;aquí a una estona i serà més complet.</p>}
      {!rep ? <p className="muted">Tria un equip.</p> : <Sheet r={rep} raw={raw} sheetRef={sheet} />}
    </div>
  );
}

function Sheet({ r, raw, sheetRef }: { r: RivalReport; raw: BigRaw; sheetRef: React.RefObject<HTMLDivElement | null> }) {
  const T = r.team, U = r.us;
  return (
    <article className="rr-sheet" ref={sheetRef}>
      <header className="rr-head rr-block">
        <div className="rr-crests">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {T.crest ? <img src={T.crest} alt="" width={74} height={74} /> : <span className="rr-crest-ph" />}
          <span className="rr-vs">vs</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escut.png" alt="" width={64} height={64} />
        </div>
        <div className="rr-title">
          <span className="rr-k">Informe del rival · Juvenil C</span>
          <h2>{T.name}</h2>
          <span className="rr-sub">
            {r.next ? `J${r.next.j} · ${r.next.date ? `${fmtDateSmart(r.next.date.slice(0, 10))} ${r.next.date.slice(11, 16)} h` : "data per confirmar"} · ${r.next.rivalHome ? "al seu camp" : "a casa"}` : "Sense partit pendent contra nosaltres"}
          </span>
        </div>
        <div className="rr-pos"><b>{T.pos}a</b><span>{T.pts} pts</span></div>
      </header>

      <section className="rr-block">
        <h3>En resum</h3>
        <ul className="rr-list">{r.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>

      <section className="rr-block rr-two">
        <div className="rr-col good"><h3>💪 Punts forts</h3>{r.strengths.length ? <ul className="rr-list">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="muted small">Res que destaqui per sobre de la mitjana.</p>}</div>
        <div className="rr-col bad"><h3>🎯 Punts febles</h3>{r.weaknesses.length ? <ul className="rr-list">{r.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="muted small">Cap debilitat clara a les dades.</p>}</div>
      </section>

      {r.keys.length > 0 && (
        <section className="rr-block rr-keys">
          <h3>🔑 Claus per al partit</h3>
          <ol>{r.keys.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      )}

      {r.watch.length > 0 && (
        <section className="rr-block">
          <h3>👀 A qui vigilar</h3>
          <ul className="rr-list">{r.watch.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}

      <section className="rr-block">
        <h3>Cara a cara amb nosaltres</h3>
        <Compare T={T} U={U} />
      </section>

      <section className="rr-block">
        <h3>Quan marquen i quan encaixen</h3>
        <Periods r={r} />
      </section>

      <section className="rr-block rr-two">
        <div><h3>Onze tipus</h3><Xi list={r.xi} /></div>
        <div><h3>Últim onze</h3>{r.lastXi.length ? <Xi list={r.lastXi} /> : <p className="muted small">Sense acta de l&apos;últim partit.</p>}</div>
      </section>

      <section className="rr-block">
        <h3>Plantilla ({r.players.length} jugadores)</h3>
        <Squad list={r.players} />
        <p className="muted small rr-legend">🔥 en ratxa (gols a les 3 últimes jornades) · 🆕 cara nova · ❓ habitual que no va jugar l&apos;últim partit · ⛔ sanció · C capitana</p>
      </section>

      {r.keepers.length > 0 && (
        <section className="rr-block">
          <h3>Porteres</h3>
          <table className="rr-table">
            <thead><tr><th>Dors.</th><th>Portera</th><th>PJ</th><th>Encaixats</th><th>Per partit</th><th>A zero</th></tr></thead>
            <tbody>{r.keepers.map((k) => <tr key={k.id}><td>{k.dorsal}</td><td>{k.name}</td><td>{k.starts}</td><td>{k.gkConceded}</td><td>{k.starts ? n1(k.gkConceded / k.starts) : "–"}</td><td>{k.gkCleanSheets}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <section className="rr-block">
        <h3>Resultats</h3>
        <ul className="rr-results">
          {r.matches.map((m) => (
            <li key={m.j} className={m.res}>
              <span className="rr-j">J{m.j}</span>
              <span className="rr-opp">{m.home ? "🏠" : "🚌"} {r.league.teams.find((t) => t.id === m.oppId)?.name ?? m.opp}</span>
              <b>{m.gf}-{m.gc}</b>
            </li>
          ))}
        </ul>
      </section>

      {r.common.length > 0 && (
        <section className="rr-block">
          <h3>Rivals comuns</h3>
          <table className="rr-table">
            <thead><tr><th>Rival</th><th>{T.name}</th><th>Nosaltres</th></tr></thead>
            <tbody>{r.common.map((c, i) => <tr key={i}><td>{c.opp}</td><td>{c.them}</td><td>{c.us}</td></tr>)}</tbody>
          </table>
          <p className="muted small">(c) a casa · (f) a fora</p>
        </section>
      )}

      <p className="muted small rr-foot">Fet automàticament amb les dades públiques de la FCF d&apos;aquesta temporada ({r.league.playedRounds} jornades jugades) · {fmtDate(raw.updated_at.slice(0, 10))}</p>
    </article>
  );
}

function Compare({ T, U }: { T: TeamStat; U: TeamStat | null }) {
  const row = (label: string, a: string | number, b: string | number) => <tr><td>{label}</td><td><b>{a}</b></td><td>{b}</td></tr>;
  const pp = (s: { pj: number; pts: number }) => (s.pj ? n1(s.pts / s.pj) : "–");
  const pg = (x: number, pj: number) => (pj ? n1(x / pj) : "–");
  return (
    <table className="rr-table rr-cmp">
      <thead><tr><th /><th>{T.name}</th><th>CE Europa</th></tr></thead>
      <tbody>
        {row("Posició", `${T.pos}a`, U ? `${U.pos}a` : "–")}
        {row("Punts per partit", n1(T.ppg), U ? n1(U.ppg) : "–")}
        {row("Gols a favor / partit", pg(T.gf, T.pj), U ? pg(U.gf, U.pj) : "–")}
        {row("Gols en contra / partit", pg(T.gc, T.pj), U ? pg(U.gc, U.pj) : "–")}
        {row("Punts/partit a casa", pp(T.home), U ? pp(U.home) : "–")}
        {row("Punts/partit a fora", pp(T.away), U ? pp(U.away) : "–")}
        {row("Porteria a zero", T.cleanSheets, U ? U.cleanSheets : "–")}
        {row("Partits sense marcar", T.failedToScore, U ? U.failedToScore : "–")}
        {row("Marquen primer", `${T.scoredFirst.n} (${T.scoredFirst.n ? n1(T.scoredFirst.pts / T.scoredFirst.n) : "–"} pts)`, U ? `${U.scoredFirst.n} (${U.scoredFirst.n ? n1(U.scoredFirst.pts / U.scoredFirst.n) : "–"} pts)` : "–")}
        {row("Jugadores utilitzades", T.squadUsed, U ? U.squadUsed : "–")}
        {row("Targetes", `${T.yc} 🟨 ${T.rc} 🟥`, U ? `${U.yc} 🟨 ${U.rc} 🟥` : "–")}
        {row("Projecció final", `${T.projected} pts`, U ? `${U.projected} pts` : "–")}
      </tbody>
    </table>
  );
}

function Periods({ r }: { r: RivalReport }) {
  const max = Math.max(1, ...r.periodsFor, ...r.periodsAgainst);
  return (
    <div className="rr-periods">
      {PERIODS.map((p, i) => (
        <div key={p} className="rr-per">
          <div className="rr-bars">
            <i className="for" style={{ height: `${(r.periodsFor[i] / max) * 100}%` }}><b>{r.periodsFor[i] || ""}</b></i>
            <i className="against" style={{ height: `${(r.periodsAgainst[i] / max) * 100}%` }}><b>{r.periodsAgainst[i] || ""}</b></i>
          </div>
          <span>{p}</span>
        </div>
      ))}
      <p className="rr-per-legend"><i className="for" /> marcats <i className="against" /> encaixats</p>
    </div>
  );
}

function Xi({ list }: { list: RPlayer[] }) {
  return (
    <ol className="rr-xi">
      {list.map((p) => <li key={p.id}><span className="rr-d">{p.dorsal || "–"}</span>{p.name}{p.gk && <em> (portera)</em>}{p.goals > 0 && <small> · {p.goals} ⚽</small>}</li>)}
    </ol>
  );
}

function Squad({ list }: { list: RPlayer[] }) {
  return (
    <table className="rr-table rr-squad">
      <thead><tr><th>Dors.</th><th>Jugadora</th><th>Conv.</th><th>Tit.</th><th>⚽</th><th>🟨</th><th>🟥</th><th /></tr></thead>
      <tbody>
        {list.map((p) => (
          <tr key={p.id} className={p.startRate >= 0.75 ? "core" : ""}>
            <td>{p.dorsal}</td>
            <td>{p.name}{p.gk ? " (POR)" : ""}{p.caps > 0 ? " · C" : ""}</td>
            <td>{p.calls}</td><td>{p.starts}</td><td>{p.goals || ""}</td><td>{p.yc || ""}</td><td>{p.rc || ""}</td>
            <td className="rr-flags">{p.recentGoals > 0 ? "🔥" : ""}{p.newcomer ? "🆕" : ""}{p.missingRegular ? "❓" : ""}{p.sanction ? "⛔" : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
