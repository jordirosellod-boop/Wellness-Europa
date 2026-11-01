"use client";

import { useEffect, useMemo, useState } from "react";
import { Shirt, useDorsals } from "@/components/shirt";
import type { Convocation, RosterRow } from "@/lib/convo";
import { fetchAll, supabase } from "@/lib/supabase";

// Minuts jugats, apuntats en directe: el rellotge del partit i qui és al camp.
// Tot es guarda al mòbil mentre dura (si es tanca l'app, continua on era) i a la base de dades a cada canvi.

type Phase = "pre" | "h1" | "ht" | "h2" | "end";
type State = {
  phase: Phase;
  clock: number; // ms de joc acumulats
  runningSince: number | null; // Date.now() quan corre el rellotge
  on: string[]; // al camp
  starters: string[];
  acc: Record<string, number>; // ms jugats (sense comptar el tram actual)
  since: Record<string, number>; // ms de joc quan ha entrat (si és al camp)
};
const PHASE_LABEL: Record<Phase, string> = { pre: "Abans de començar", h1: "1a part", ht: "Descans", h2: "2a part", end: "Final" };
const key = (cid: string) => `minuts:${cid}`;

const clockNow = (s: State) => s.clock + (s.runningSince ? Date.now() - s.runningSince : 0);
const playedMs = (s: State, id: string) => (s.acc[id] ?? 0) + (s.on.includes(id) && s.since[id] != null ? clockNow(s) - s.since[id] : 0);
const mmss = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const mins = (ms: number) => Math.min(130, Math.round(ms / 60000));

function load(cid: string): State | null {
  try { const v = localStorage.getItem(key(cid)); return v ? (JSON.parse(v) as State) : null; } catch { return null; }
}

export function MinutesLive({ c, roster }: { c: Convocation; roster: RosterRow[] }) {
  const called = useMemo(() => roster.filter((r) => r.called && !r.guest).sort((a, b) => (a.dorsal ?? 99) - (b.dorsal ?? 99)), [roster]);
  const dorsals = useDorsals();
  const [st, setSt] = useState<State | null>(null);
  const [, tick] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [season, setSeason] = useState<Map<string, { min: number; pj: number; tit: number }> | null>(null);

  // Estat inicial: el que hi havia al mòbil o, si no, l'onze inicial de la pissarra
  useEffect(() => {
    let alive = true;
    const saved = load(c.id);
    if (saved) { Promise.resolve().then(() => alive && setSt(saved)); return () => { alive = false; }; }
    supabase().from("convocation_lineups").select("slots").eq("convocation_id", c.id).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const ids = new Set(called.map((r) => r.player_id));
      const xi = Object.values((data?.slots ?? {}) as Record<string, string>).filter((id) => ids.has(id));
      setSt({ phase: "pre", clock: 0, runningSince: null, on: xi, starters: xi, acc: {}, since: {} });
    });
    return () => { alive = false; };
  }, [c.id, called]);

  // El rellotge es repinta cada segon mentre corre
  useEffect(() => {
    if (!st?.runningSince) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [st?.runningSince]);

  useEffect(() => { loadSeason(); }, []);
  async function loadSeason() {
    const rows = await fetchAll<{ player_id: string; minutes: number; started: boolean }>((f, t) =>
      supabase().from("match_minutes").select("player_id, minutes, started").order("convocation_id").order("player_id").range(f, t)).catch(() => []);
    const m = new Map<string, { min: number; pj: number; tit: number }>();
    for (const r of rows) {
      const x = m.get(r.player_id) ?? { min: 0, pj: 0, tit: 0 };
      x.min += r.minutes; if (r.minutes > 0) x.pj++; if (r.started) x.tit++;
      m.set(r.player_id, x);
    }
    setSeason(m);
  }

  function commit(next: State, save = false) {
    setSt(next);
    try { localStorage.setItem(key(c.id), JSON.stringify(next)); } catch { /* sense emmagatzematge */ }
    if (save || next.phase !== "pre") persist(next);
  }

  async function persist(s: State) {
    const rows = called
      .filter((r) => playedMs(s, r.player_id) > 0 || s.starters.includes(r.player_id))
      .map((r) => ({ convocation_id: c.id, player_id: r.player_id, minutes: mins(playedMs(s, r.player_id)), started: s.starters.includes(r.player_id) }));
    if (!rows.length) return;
    const { error } = await supabase().from("match_minutes").upsert(rows, { onConflict: "convocation_id,player_id" }).select("player_id");
    setMsg(error ? { ok: false, text: `No s'han pogut desar els minuts: ${error.message}` } : { ok: true, text: "Minuts desats ✓" });
    if (!error && s.phase === "end") loadSeason();
  }

  if (!st) return null;
  const now = clockNow(st);

  function setPhase(p: Phase) {
    const s = { ...st!, phase: p };
    const running = p === "h1" || p === "h2";
    if (running && !s.runningSince) {
      s.runningSince = Date.now();
      if (st!.phase === "pre") { s.starters = [...s.on]; s.since = Object.fromEntries(s.on.map((id) => [id, 0])); }
    }
    if (!running && s.runningSince) { s.clock = clockNow(s); s.runningSince = null; }
    commit(s, p === "end");
  }

  function toggle(id: string) {
    const s: State = { ...st!, on: [...st!.on], acc: { ...st!.acc }, since: { ...st!.since } };
    if (s.on.includes(id)) {
      // Surt: es guarda el que ha jugat
      if (s.phase !== "pre") s.acc[id] = playedMs(st!, id);
      delete s.since[id];
      s.on = s.on.filter((x) => x !== id);
    } else {
      s.on.push(id);
      if (s.phase !== "pre") s.since[id] = clockNow(s);
    }
    if (s.phase === "pre") s.starters = [...s.on];
    commit(s);
  }

  function reset() {
    if (!window.confirm("Tornar a començar el comptador d'aquest partit?")) return;
    try { localStorage.removeItem(key(c.id)); } catch { /* res */ }
    setSt({ phase: "pre", clock: 0, runningSince: null, on: st!.starters, starters: st!.starters, acc: {}, since: {} });
    setMsg(null);
  }

  const onField = called.filter((r) => st.on.includes(r.player_id));
  const bench = called.filter((r) => !st.on.includes(r.player_id));
  const row = (r: RosterRow, out: boolean) => (
    <li key={r.player_id}>
      <button type="button" className={`ml-p${out ? " on" : ""}`} onClick={() => toggle(r.player_id)} disabled={st.phase === "end"}
        aria-label={`${r.display_name}: ${out ? "fer sortir" : "fer entrar"}`}>
        <Shirt n={r.dorsal} gk={dorsals.get(r.player_id)?.gk} size={26} />
        <span className="ml-name">{r.display_name}</span>
        <span className="ml-min">{st.phase === "pre" ? "" : `${mins(playedMs(st, r.player_id))}'`}</span>
        <span className="ml-act">{st.phase === "end" ? "" : out ? "Surt ↓" : "Entra ↑"}</span>
      </button>
    </li>
  );

  return (
    <section className="card minutes-live">
      <div className="row between">
        <h2 style={{ margin: 0 }}>⏱️ Minuts en directe</h2>
        <span className="chip">Només staff</span>
      </div>
      <div className={`ml-clock${st.runningSince ? " run" : ""}`}>
        <b>{mmss(now)}</b>
        <span>{PHASE_LABEL[st.phase]} · {onField.length} al camp</span>
      </div>
      <div className="row" style={{ gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
        {st.phase === "pre" && <button className="btn" disabled={!onField.length} onClick={() => setPhase("h1")}>▶ Comença el partit</button>}
        {st.phase === "h1" && <button className="btn" onClick={() => setPhase("ht")}>⏸ Descans</button>}
        {st.phase === "ht" && <button className="btn" onClick={() => setPhase("h2")}>▶ Comença la 2a part</button>}
        {st.phase === "h2" && <button className="btn" onClick={() => setPhase("end")}>🏁 Final del partit</button>}
        {st.phase !== "pre" && <button className="btn secondary" onClick={reset}>Tornar a començar</button>}
      </div>
      {st.phase === "pre" && <p className="muted small" style={{ textAlign: "center", margin: "6px 0 0" }}>Revisa qui comença al camp (l&apos;onze inicial ja hi és) i toca «Comença el partit».</p>}
      {msg && <p className={`small ${msg.ok ? "muted" : "msg error"}`} style={{ textAlign: "center" }}>{msg.text}</p>}

      <h3 className="ml-h">Al camp <span>{onField.length}</span></h3>
      <ul className="ml-list">{onField.map((r) => row(r, true))}</ul>
      <h3 className="ml-h">Banqueta <span>{bench.length}</span></h3>
      <ul className="ml-list">{bench.map((r) => row(r, false))}</ul>

      {season && season.size > 0 && (
        <details className="ml-season">
          <summary>Minuts de la temporada</summary>
          <table>
            <thead><tr><th>Jugadora</th><th>Min</th><th>PJ</th><th>Tit</th></tr></thead>
            <tbody>
              {roster.filter((r) => !r.guest).map((r) => ({ r, s: season.get(r.player_id) ?? { min: 0, pj: 0, tit: 0 } }))
                .sort((a, b) => b.s.min - a.s.min)
                .map(({ r, s }) => <tr key={r.player_id}><td>{r.display_name}</td><td><b>{s.min}</b></td><td>{s.pj}</td><td>{s.tit}</td></tr>)}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
