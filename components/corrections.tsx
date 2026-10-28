"use client";

import { useEffect, useState } from "react";
import { AEVENT_COLS, AMATCH_COLS, minuteOf, type AEvent, type AMatch } from "@/lib/analysis";
import { fetchAll, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/wellness";
import { Loading } from "@/components/loading";

export const CORR_CATS = ["Atac", "Defensa", "Transicions", "ABP", "Porteria", "Individual", "Equip"] as const;
export type Correction = {
  id: string; title: string; category: (typeof CORR_CATS)[number]; description: string | null;
  status: "pendent" | "treballant" | "corregit"; player_ids: string[]; event_ids: string[]; created_at: string;
};
const COLS = "id, title, category, description, status, player_ids, event_ids, created_at";
const STATUS: Record<Correction["status"], string> = { pendent: "Pendent", treballant: "Treballant-hi", corregit: "Corregit" };

export async function fetchCorrections(): Promise<Correction[]> {
  const sb = supabase();
  return fetchAll<Correction>((f, t) => sb.from("corrections").select(COLS).order("created_at", { ascending: false }).order("id").range(f, t));
}

/** Afegir una acció del vídeo (clip) a una correcció nova o existent. */
export function AddToCorrection({ ev, onDone }: { ev: AEvent; onDone: (text: string) => void }) {
  const [list, setList] = useState<Correction[] | null>(null);
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState<Correction["category"]>("Equip");
  useEffect(() => {
    fetchCorrections().then(setList, () => setList([]));
  }, []);
  async function addTo(c: Correction) {
    const { data, error } = await supabase().from("corrections")
      .update({ event_ids: [...new Set([...c.event_ids, ev.id])], player_ids: ev.player_id ? [...new Set([...c.player_ids, ev.player_id])] : c.player_ids })
      .eq("id", c.id).select("id").maybeSingle();
    onDone(error || !data ? `No s'ha pogut afegir: ${error?.message ?? ""}` : `Clip afegit a «${c.title}» ✓`);
  }
  async function create() {
    if (!title.trim()) return;
    const { data, error } = await supabase().from("corrections")
      .insert({ title: title.trim(), category: cat, event_ids: [ev.id], player_ids: ev.player_id ? [ev.player_id] : [] })
      .select("id").maybeSingle();
    onDone(error || !data ? `No s'ha pogut crear: ${error?.message ?? ""}` : `Correcció «${title.trim()}» creada amb aquest clip ✓`);
  }
  return (
    <div className="corr-add">
      <label className="field">Afegir aquest clip a una correcció</label>
      {list?.filter((c) => c.status !== "corregit").slice(0, 8).map((c) => (
        <button key={c.id} type="button" className="btn small secondary" onClick={() => addTo(c)} style={{ margin: "0 6px 6px 0" }}>+ {c.title}</button>
      ))}
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <input type="text" style={{ flex: 1, minWidth: 0 }} maxLength={120} placeholder="…o una de nova (ex.: «Distàncies entre línies»)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value as Correction["category"])} style={{ width: "auto" }} aria-label="Categoria">
          {CORR_CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="btn small" disabled={!title.trim()} onClick={create}>Crear</button>
      </div>
    </div>
  );
}

async function loadCorrectionsData() {
  const sb = supabase();
  const [list, players, ms] = await Promise.all([
    fetchCorrections(),
    fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").eq("role", "player").order("display_name").order("id").range(f, t)),
    fetchAll<AMatch>((f, t) => sb.from("analysis_matches").select(AMATCH_COLS).order("match_date").order("id").range(f, t)),
  ]);
  const ids = [...new Set(list.flatMap((x) => x.event_ids))];
  const evs: AEvent[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    evs.push(...(await fetchAll<AEvent>((f, t) => sb.from("analysis_events").select(AEVENT_COLS).in("id", chunk).order("id").range(f, t))));
  }
  return {
    list,
    players,
    events: new Map(evs.map((e) => [e.id, { ...e, t: Number(e.t) }])),
    matches: new Map(ms.map((m) => [m.id, m])),
  };
}

/** Llista de correccions de l'equip i de jugadores, amb els clips i l'estat. */
export function CorrectionsPanel() {
  const [list, setList] = useState<Correction[] | null>(null);
  const [events, setEvents] = useState<Map<string, AEvent>>(new Map());
  const [matches, setMatches] = useState<Map<string, AMatch>>(new Map());
  const [players, setPlayers] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | Correction["status"] | "all">("open");
  const [form, setForm] = useState({ title: "", category: "Equip" as Correction["category"], description: "", player_ids: [] as string[] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    loadCorrectionsData().then(
      (d) => {
        if (!alive) return;
        setList(d.list);
        setPlayers(d.players);
        setEvents(d.events);
        setMatches(d.matches);
      },
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);

  async function upd(c: Correction, patch: Partial<Correction>) {
    const { data, error: e } = await supabase().from("corrections").update(patch).eq("id", c.id).select(COLS).maybeSingle();
    if (e || !data) return setMsg({ ok: false, text: `No s'ha pogut desar: ${e?.message ?? ""}` });
    setList((l) => l && l.map((x) => (x.id === c.id ? (data as Correction) : x)));
  }
  async function del(c: Correction) {
    if (!window.confirm(`Esborrar «${c.title}»?`)) return;
    const { data, error: e } = await supabase().from("corrections").delete().eq("id", c.id).select("id");
    if (e || !data?.length) return setMsg({ ok: false, text: `No s'ha pogut esborrar: ${e?.message ?? ""}` });
    setList((l) => l && l.filter((x) => x.id !== c.id));
  }
  async function create() {
    if (!form.title.trim()) return setMsg({ ok: false, text: "Posa un títol." });
    const { data, error: e } = await supabase().from("corrections")
      .insert({ title: form.title.trim(), category: form.category, description: form.description.trim() || null, player_ids: form.player_ids })
      .select(COLS).maybeSingle();
    if (e || !data) return setMsg({ ok: false, text: `No s'ha pogut crear: ${e?.message ?? ""}` });
    setList((l) => [data as Correction, ...(l ?? [])]);
    setForm({ title: "", category: "Equip", description: "", player_ids: [] });
    setMsg({ ok: true, text: "Correcció creada ✓" });
  }

  if (error) return <p className="msg error">{error}</p>;
  if (!list) return <Loading />;
  const shown = list.filter((c) => (filter === "all" ? true : filter === "open" ? c.status !== "corregit" : c.status === filter));
  const pname = (id: string) => players.find((p) => p.id === id)?.display_name ?? "—";

  return (
    <div className="corrections">
      <section className="card stack">
        <h3 className="esc" style={{ margin: 0 }}>Nova correcció</h3>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <input type="text" style={{ flex: 1, minWidth: 0 }} maxLength={120} placeholder="Ex.: Basculació quan la pilota va a banda" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Correction["category"] })} style={{ width: "auto" }} aria-label="Categoria">
            {CORR_CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <textarea maxLength={2000} placeholder="Què passa i com ho volem (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="an-players">
          {players.map((p) => (
            <button key={p.id} type="button" aria-pressed={form.player_ids.includes(p.id)}
              onClick={() => setForm({ ...form, player_ids: form.player_ids.includes(p.id) ? form.player_ids.filter((x) => x !== p.id) : [...form.player_ids, p.id] })}>
              {p.display_name.split(" ")[0]}
            </button>
          ))}
        </div>
        <button className="btn" onClick={create}>Crear correcció</button>
        <p className="muted small" style={{ margin: 0 }}>També en pots crear des d&apos;una acció del vídeo (botó ✎ → «Afegir a correccions»), i així hi queda el clip.</p>
        {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}
      </section>

      <div className="row between" style={{ margin: "6px 0" }}>
        <div className="seg-toggle" role="group" aria-label="Filtre">
          <button type="button" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Obertes</button>
          <button type="button" aria-pressed={filter === "corregit"} onClick={() => setFilter("corregit")}>Corregides</button>
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Totes</button>
        </div>
        <button className="btn small secondary" onClick={() => window.print()}>🖨 PDF</button>
      </div>

      {shown.length === 0 && <p className="card muted">No hi ha cap correcció aquí.</p>}
      {shown.map((c) => (
        <section key={c.id} className={`card corr ${c.status}`}>
          <div className="row between">
            <b className="esc" style={{ fontSize: "1.2rem" }}>{c.title}</b>
            <span className="chip">{c.category}</span>
          </div>
          {c.description && <p style={{ whiteSpace: "pre-line", margin: "6px 0" }}>{c.description}</p>}
          {c.player_ids.length > 0 && <p className="muted small" style={{ margin: "4px 0" }}>Jugadores: {c.player_ids.map(pname).join(", ")}</p>}
          {c.event_ids.length > 0 && (
            <ul className="corr-clips">
              {c.event_ids.map((id) => {
                const e = events.get(id);
                const m = e ? matches.get(e.match_id) : undefined;
                if (!e || !m) return <li key={id} className="muted small">Clip esborrat</li>;
                return (
                  <li key={id}>
                    <a href={`/entrenador/analisi?id=${m.id}&ev=${e.id}`}>▶ {m.title} · {minuteOf(m, e.t)} · {e.action}{e.player_id ? ` · ${pname(e.player_id)}` : ""}</a>
                    <button className="an-ic" aria-label="Treure el clip" onClick={() => upd(c, { event_ids: c.event_ids.filter((x) => x !== id) })}>✕</button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="row between" style={{ marginTop: 6 }}>
            <div className="seg-toggle" role="group" aria-label="Estat">
              {(Object.keys(STATUS) as Correction["status"][]).map((s) => (
                <button key={s} type="button" aria-pressed={c.status === s} onClick={() => c.status !== s && upd(c, { status: s })}>{STATUS[s]}</button>
              ))}
            </div>
            <button className="an-ic" aria-label="Esborrar" onClick={() => del(c)}>🗑</button>
          </div>
        </section>
      ))}

      {/* Per imprimir */}
      <div className="an-report scout-print">
        <header className="rp-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escut.png" alt="" width={54} height={54} />
          <div className="rp-title"><b>Correccions</b><span>Juvenil C · {shown.length} punts</span></div>
        </header>
        {CORR_CATS.filter((cat) => shown.some((c) => c.category === cat)).map((cat) => (
          <section key={cat} className="rp-block">
            <h3>{cat}</h3>
            <table className="rp-table">
              <tbody>
                {shown.filter((c) => c.category === cat).map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.title}</b>{c.description ? <div style={{ whiteSpace: "pre-line" }}>{c.description}</div> : null}</td>
                    <td>{c.player_ids.map(pname).join(", ")}</td>
                    <td>{STATUS[c.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
