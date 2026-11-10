"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { StoryCard } from "@/components/convo-story";
import { Empty } from "@/components/empty";
import { Loading } from "@/components/loading";
import { fetchNotices, type Notice } from "@/lib/absence";
import { fetchBibPlayers, type BibPlayer } from "@/lib/bibs";
import { addDays, fmtShort, isoDow } from "@/lib/dates";
import { drawMeetingsImage, groupDays, seasonOf } from "@/lib/meetings-image";
import {
  DEFAULT_WINDOWS, DOW_NAMES, endOf, fetchRounds, fetchSlots, hm, planSlots, windowOf,
  type MeetingRound, type MeetingSlot, type Window,
} from "@/lib/meetings";
import { fetchAll, supabase } from "@/lib/supabase";
import { todayMadrid } from "@/lib/wellness";

export default function MeetingsPage() {
  return (
    <>
      <CoachShell>{() => <Meetings />}</CoachShell>
      <Footer />
    </>
  );
}

function Meetings() {
  const [rounds, setRounds] = useState<MeetingRound[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => fetchRounds().then(setRounds, (e) => setErr(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => { void load(); }, [load]);

  const current = rounds?.find((r) => r.id === open) ?? null;
  return (
    <>
      <div className="row between" style={{ alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Reunions</h1>
        {!creating && !current && <button type="button" className="btn small" onClick={() => setCreating(true)}>+ Nova ronda</button>}
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>Reunions individuals amb cada jugadora. Cadascuna només veu la seva (dia i hora) i li arriba l&apos;avís al mòbil.</p>
      {err && <p className="msg error">{err}</p>}
      {creating && <NewRound onCancel={() => setCreating(false)} onDone={(id) => { setCreating(false); setOpen(id); void load(); }} />}
      {current && <RoundView round={current} onBack={() => setOpen(null)} onChanged={load} />}
      {!creating && !current && (
        rounds == null ? <Loading /> : rounds.length === 0 ? (
          <Empty art="list" title="Encara no hi ha cap ronda de reunions" hint="Toca «+ Nova ronda»: l'app reparteix les jugadores a les franges." />
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            {rounds.map((r) => (
              <button key={r.id} type="button" className="card mt-round" onClick={() => setOpen(r.id)}>
                <b>{r.title}</b>
                <span className={`chip ${r.published ? "fet" : "pendent"}`}>{r.published ? "Publicada" : "Esborrany"}</span>
                <small className="muted">{r.duration_min} min · creada el {fmtShort(r.created_at.slice(0, 10))}</small>
              </button>
            ))}
          </div>
        )
      )}
    </>
  );
}

const MONTHS = ["gen", "feb", "mar", "abr", "mai", "jun", "jul", "ago", "set", "oct", "nov", "des"];
const nextMonday = (today: string) => addDays(today, ((8 - isoDow(today)) % 7) || 7);

/** Nova ronda: nom, durada, des de quin dia i les franges de cada setmana. Les jugadores van per dorsal dels petos. */
function NewRound({ onCancel, onDone }: { onCancel: () => void; onDone: (id: string) => void }) {
  const today = todayMadrid();
  const [title, setTitle] = useState("Reunions individuals");
  const [minutes, setMinutes] = useState(15);
  const [start, setStart] = useState(nextMonday(today));
  const [wins, setWins] = useState<Window[]>(DEFAULT_WINDOWS);
  const [onlyTraining, setOnlyTraining] = useState(true);
  const [players, setPlayers] = useState<BibPlayer[] | null>(null);
  const [first, setFirst] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetchBibPlayers().then(setPlayers, (e) => setMsg(e instanceof Error ? e.message : String(e))); }, []);

  const setWin = (i: number, k: keyof Window, v: string | number) => setWins((ws) => ws.map((w, j) => (j === i ? { ...w, [k]: v } : w)));

  async function create() {
    if (!players?.length) return;
    if (!title.trim()) return setMsg("Posa-li un nom.");
    setBusy(true); setMsg(null);
    const sb = supabase();
    // Dies sense entreno (festius, setmanes sense sessions): no s'hi posen reunions
    let skip = new Set<string>();
    if (onlyTraining) {
      const sess = await fetchAll<{ session_date: string }>((f, t) => sb.from("sessions").select("session_date").eq("cancelled", false).gte("session_date", start).lte("session_date", addDays(start, 120)).order("session_date").order("id").range(f, t));
      const has = new Set(sess.map((s) => s.session_date));
      skip = new Set(Array.from({ length: 121 }, (_, i) => addDays(start, i)).filter((d) => !has.has(d)));
    }
    const order = players.map((p) => p.id);
    if (first) order.splice(0, order.length, first, ...order.filter((id) => id !== first));
    const plan = planSlots(order, start, wins, minutes, skip);
    if (plan.filter((p) => p.player_id).length < order.length) {
      setBusy(false);
      return setMsg(onlyTraining ? "No hi ha prou dies d'entreno amb aquestes franges. Afegeix-ne o treu «Només dies d'entreno»." : "Les franges no donen per a totes les jugadores.");
    }
    const { data: round, error } = await sb.from("meeting_rounds").insert({ title: title.trim(), duration_min: minutes }).select("id").single();
    if (error || !round) { setBusy(false); return setMsg(`No s'ha pogut crear: ${error?.message ?? "torna-ho a provar"}`); }
    const { error: e2 } = await sb.from("meeting_slots").insert(plan.map((p) => ({ ...p, round_id: round.id }))).select("id");
    if (e2) {
      await sb.from("meeting_rounds").delete().eq("id", round.id);
      setBusy(false);
      return setMsg(`No s'han pogut desar les franges: ${e2.message}`);
    }
    setBusy(false);
    onDone(round.id as string);
  }

  return (
    <section className="card stack" style={{ marginTop: 12 }}>
      <h2 style={{ margin: 0 }}>Nova ronda</h2>
      <div>
        <label className="field" htmlFor="mt-title">Nom</label>
        <input id="mt-title" type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="mt-start">Des del</label>
          <input id="mt-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="mt-min">Minuts cadascuna</label>
          <select id="mt-min" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="field">Franges de cada setmana</label>
        <div className="mt-wins">
          {wins.map((w, i) => (
            <div key={i} className="mt-win">
              <select value={w.dow} onChange={(e) => setWin(i, "dow", Number(e.target.value))} aria-label="Dia">
                {DOW_NAMES.slice(1).map((n, j) => <option key={n} value={j + 1}>{n}</option>)}
              </select>
              <input type="time" value={w.from} onChange={(e) => setWin(i, "from", e.target.value)} aria-label="Des de" />
              <input type="time" value={w.to} onChange={(e) => setWin(i, "to", e.target.value)} aria-label="Fins a" />
              <input type="text" value={w.label} maxLength={30} onChange={(e) => setWin(i, "label", e.target.value)} aria-label="Què es fa" placeholder="Hora de gym" />
              <button type="button" className="btn small secondary" onClick={() => setWins((ws) => ws.filter((_, j) => j !== i))} aria-label="Treure la franja">✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn small secondary" style={{ marginTop: 6 }} onClick={() => setWins((ws) => [...ws, { dow: 3, from: "19:00", to: "19:30", label: "" }])}>+ Afegir franja</button>
      </div>
      <label className="check"><input type="checkbox" checked={onlyTraining} onChange={(e) => setOnlyTraining(e.target.checked)} /> Només els dies que hi ha entreno (se salta festius)</label>
      <div>
        <label className="field" htmlFor="mt-first">La primera</label>
        <select id="mt-first" value={first} onChange={(e) => setFirst(e.target.value)}>
          <option value="">Per ordre de dorsal</option>
          {players?.map((p) => <option key={p.id} value={p.id}>{p.dorsal != null ? `${p.dorsal} · ` : ""}{p.name}</option>)}
        </select>
        <p className="muted small" style={{ margin: "4px 0 0" }}>La resta van per ordre de dorsal dels petos. Després pots intercanviar-les.</p>
      </div>
      {msg && <p className="msg error">{msg}</p>}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn" disabled={busy || !players} onClick={create}>{busy ? "Creant…" : `Crear (${players?.length ?? "…"} jugadores)`}</button>
        <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel·lar</button>
      </div>
    </section>
  );
}

/** Una ronda: les reunions per dies. Toca dues files per intercanviar-les (o una jugadora i una franja lliure). */
function RoundView({ round, onBack, onChanged }: { round: MeetingRound; onBack: () => void; onChanged: () => void }) {
  const [slots, setSlots] = useState<MeetingSlot[] | null>(null);
  const [players, setPlayers] = useState<BibPlayer[]>([]);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [title, setTitle] = useState(round.title);
  const [adding, setAdding] = useState<{ day: string; time: string } | null>(null);

  const load = useCallback(async () => {
    const s = await fetchSlots(round.id);
    setSlots(s);
    // Qui ha avisat que no vindrà a l'entreno d'aquell dia
    if (s.length) {
      const sb = supabase();
      const days = [...new Set(s.map((x) => x.day))];
      const sess = await fetchAll<{ id: string; session_date: string }>((f, t) => sb.from("sessions").select("id, session_date").in("session_date", days).order("id").range(f, t));
      const dayOf = new Map(sess.map((x) => [x.id, x.session_date]));
      const n: Notice[] = await fetchNotices(sess.map((x) => x.id)).catch(() => []);
      setAbsent(new Set(n.map((x) => `${dayOf.get(x.session_id)}|${x.player_id}`)));
    }
  }, [round.id]);
  useEffect(() => { Promise.resolve().then(load).catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })); }, [load]);
  useEffect(() => { fetchBibPlayers().then(setPlayers, () => {}); }, []);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const labelOf = (day: string, t: string) => windowOf(DEFAULT_WINDOWS, day, t)?.label ?? "";
  const today = todayMadrid();
  const placed = slots?.filter((s) => s.player_id).length ?? 0;
  const missing = players.filter((p) => !slots?.some((s) => s.player_id === p.id));

  const authed = async (path: string, body: object) => {
    const { data } = await supabase().auth.getSession();
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { sent?: number; error?: string };
    if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
    return j;
  };

  async function tap(id: string) {
    if (busy) return;
    if (!pick) return setPick(id);
    if (pick === id) return setPick(null);
    const a = pick;
    setPick(null); setBusy(true); setMsg(null);
    const { error } = await supabase().rpc("swap_meeting_slots", { p_a: a, p_b: id });
    if (error) { setBusy(false); return setMsg({ ok: false, text: `No s'ha pogut canviar: ${error.message}` }); }
    await load();
    let note = "Canviat ✓";
    if (round.published) {
      try { const j = await authed("/api/push/meetings", { round_id: round.id, slot_ids: [a, id] }); note = `Canviat ✓ Avís enviat (${j.sent ?? 0}).`; }
      catch { note = "Canviat ✓ (no s'ha pogut enviar l'avís)"; }
    }
    setBusy(false);
    setMsg({ ok: true, text: note });
  }
  async function toggleDone(s: MeetingSlot) {
    setBusy(true);
    const { error } = await supabase().from("meeting_slots").update({ done: !s.done, updated_at: new Date().toISOString() }).eq("id", s.id).select("id").single();
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setSlots((l) => l?.map((x) => (x.id === s.id ? { ...x, done: !s.done } : x)) ?? l);
  }
  async function placeMissing(pid: string) {
    const free = slots?.find((s) => !s.player_id && s.day >= today);
    if (!free) return setMsg({ ok: false, text: "No hi ha cap franja lliure. Afegeix-ne una." });
    setBusy(true);
    const { error } = await supabase().from("meeting_slots").update({ player_id: pid, updated_at: new Date().toISOString() }).eq("id", free.id).select("id").single();
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    await load();
  }
  async function addSlot() {
    if (!adding?.day || !adding.time) return;
    setBusy(true);
    const { error } = await supabase().from("meeting_slots").insert({ round_id: round.id, day: adding.day, start_time: adding.time }).select("id").single();
    setBusy(false);
    if (error) return setMsg({ ok: false, text: /duplicate|unique/i.test(error.message) ? "Ja hi ha una franja a aquesta hora." : error.message });
    setAdding(null);
    await load();
  }
  async function removeSlot(id: string) {
    setBusy(true);
    const { error } = await supabase().from("meeting_slots").delete().eq("id", id).is("player_id", null);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    await load();
  }
  async function publish(on: boolean) {
    setBusy(true); setMsg(null);
    const { error } = await supabase().from("meeting_rounds").update({ published: on, published_at: on ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", round.id).select("id").single();
    if (error) { setBusy(false); return setMsg({ ok: false, text: error.message }); }
    let text = on ? "Publicada ✓" : "Ja no la veuen les jugadores.";
    if (on) {
      try { const j = await authed("/api/push/meetings", { round_id: round.id }); text = `Publicada ✓ Avís enviat a ${j.sent ?? 0} mòbils.`; }
      catch (e) { text = `Publicada ✓ (l'avís no s'ha pogut enviar: ${e instanceof Error ? e.message : String(e)})`; }
    }
    setBusy(false);
    setMsg({ ok: true, text });
    onChanged();
  }
  async function saveTitle() {
    if (!title.trim() || title.trim() === round.title) return;
    const { error } = await supabase().from("meeting_rounds").update({ title: title.trim(), updated_at: new Date().toISOString() }).eq("id", round.id).select("id").single();
    if (error) return setMsg({ ok: false, text: error.message });
    onChanged();
  }
  async function remove() {
    if (!window.confirm(`Esborrar «${round.title}» i totes les seves reunions?`)) return;
    setBusy(true);
    const { error } = await supabase().from("meeting_rounds").delete().eq("id", round.id);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    onBack(); onChanged();
  }

  const days = useMemo(() => {
    const m = new Map<string, MeetingSlot[]>();
    for (const s of slots ?? []) m.set(s.day, [...(m.get(s.day) ?? []), s]);
    return [...m.entries()];
  }, [slots]);

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <button type="button" className="btn small secondary" style={{ justifySelf: "start" }} onClick={onBack}>‹ Totes les rondes</button>
      <section className="card stack">
        <input type="text" className="mt-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} aria-label="Nom de la ronda" />
        <p className="muted small" style={{ margin: 0 }}>
          {round.duration_min} min · {placed} jugadores · {round.published ? "✅ Publicada: cada jugadora veu la seva" : "📝 Esborrany: les jugadores encara no la veuen"}
        </p>
        <div className="row" style={{ gap: 6 }}>
          {!round.published
            ? <button type="button" className="btn" disabled={busy || !placed} onClick={() => publish(true)}>📣 Publicar i avisar</button>
            : <button type="button" className="btn secondary" disabled={busy} onClick={() => publish(false)}>Despublicar</button>}
          <button type="button" className="btn secondary" disabled={busy} onClick={remove}>Esborrar</button>
        </div>
        {msg && <p className={`msg${msg.ok ? " ok" : " error"}`}>{msg.text}</p>}
      </section>

      {missing.length > 0 && slots && (
        <section className="card">
          <b>Sense reunió:</b>{" "}
          {missing.map((p) => <button key={p.id} type="button" className="btn small secondary" style={{ margin: "4px 4px 0 0" }} disabled={busy} onClick={() => placeMissing(p.id)}>+ {p.name}</button>)}
          <p className="muted small" style={{ margin: "6px 0 0" }}>Toca-la per posar-la a la primera franja lliure.</p>
        </section>
      )}

      {slots == null ? <Loading /> : (
        <>
          <p className="muted small" style={{ margin: 0 }}>{pick ? "Ara toca la franja amb qui la vols intercanviar." : "Per canviar l'ordre, toca una jugadora i després una altra (o una franja lliure)."}</p>
          {days.map(([day, list]) => (
            <section key={day} className={`card mt-day${day < today ? " past" : ""}`}>
              <header>
                <span className="mt-date"><b>{Number(day.slice(8))}</b><small>{MONTHS[Number(day.slice(5, 7)) - 1]}</small></span>
                <span><b>{DOW_NAMES[isoDow(day)]}</b><small>{labelOf(day, list[0].start_time)} · {hm(list[0].start_time)}–{endOf(list[list.length - 1].start_time, round.duration_min)}</small></span>
              </header>
              {list.map((s) => {
                const p = s.player_id ? byId.get(s.player_id) : null;
                const away = s.player_id && absent.has(`${s.day}|${s.player_id}`);
                return (
                  <div key={s.id} className={`mt-row${pick === s.id ? " picked" : ""}${s.done ? " done" : ""}`}>
                    <button type="button" className="mt-main" disabled={busy} onClick={() => tap(s.id)} aria-pressed={pick === s.id}>
                      <span className="mt-time">{hm(s.start_time)}</span>
                      <span className="mt-num">{p?.dorsal ?? "–"}</span>
                      <span className="mt-name">{p ? p.name : s.player_id ? "…" : <i>Lliure</i>}</span>
                      {away && <span className="chip pendent">Ha avisat que no vindrà</span>}
                    </button>
                    {s.player_id
                      ? <button type="button" className={`mt-done${s.done ? " on" : ""}`} disabled={busy} onClick={() => toggleDone(s)} aria-label={s.done ? "Desmarcar feta" : "Marcar com a feta"}>✓</button>
                      : <button type="button" className="mt-done" disabled={busy} onClick={() => removeSlot(s.id)} aria-label="Treure la franja lliure">✕</button>}
                  </div>
                );
              })}
            </section>
          ))}
          {adding ? (
            <section className="card row" style={{ gap: 6, alignItems: "end" }}>
              <div style={{ flex: 1 }}><label className="field">Dia</label><input type="date" value={adding.day} onChange={(e) => setAdding({ ...adding, day: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label className="field">Hora</label><input type="time" value={adding.time} onChange={(e) => setAdding({ ...adding, time: e.target.value })} /></div>
              <button type="button" className="btn small" disabled={busy || !adding.day || !adding.time} onClick={addSlot}>Afegir</button>
              <button type="button" className="btn small secondary" onClick={() => setAdding(null)}>✕</button>
            </section>
          ) : (
            <button type="button" className="btn small secondary" style={{ justifySelf: "start" }} onClick={() => setAdding({ day: slots[slots.length - 1]?.day ?? today, time: "" })}>+ Afegir una franja lliure</button>
          )}
          {placed > 0 && (
            <StoryCard label="🖼️ Imatge per compartir" busyLabel="Preparant la imatge…" alt="La llista de reunions" fname={`reunions-${slots[0]?.day ?? today}.png`}
              make={() => drawMeetingsImage({
                title: round.title, minutes: round.duration_min, season: seasonOf(slots[0]?.day ?? today),
                days: groupDays(slots.filter((s) => s.player_id).map((s) => ({ day: s.day, start_time: s.start_time, name: byId.get(s.player_id!)?.name ?? "", dorsal: byId.get(s.player_id!)?.dorsal ?? null })), labelOf),
              })} />
          )}
        </>
      )}
    </div>
  );
}
