"use client";

import { useEffect, useState } from "react";
import { addDays, fmtShort } from "@/lib/dates";
import { bibName, fetchBibPlayers, fetchBibs, fetchBibSettings, type BibDay, type BibSettings } from "@/lib/bibs";
import { supabase } from "@/lib/supabase";

/** Targeta de la jugadora: qui porta els petos avui (o el proper dia) i els següents. */
export function BibsCard({ meId, today }: { meId: string; today: string }) {
  const [list, setList] = useState<BibDay[] | null>(null);
  useEffect(() => {
    fetchBibs(today, addDays(today, 21)).then(setList, () => setList([]));
  }, [today]);
  if (!list || list.length === 0) return null;
  const [first, ...rest] = list;
  const mine = first.player_id === meId;
  const when = first.day === today ? "Avui" : fmtShort(first.day);
  const myNext = list.find((b) => b.player_id === meId);
  return (
    <section className={`card bibs-card${mine ? " mine" : ""}`}>
      <h2>🦺 Petos</h2>
      <p className="bibs-now">
        {mine ? <b>{when} et toca a tu portar els petos!</b> : <><span>{when} els porta</span> <b>{bibName(first)}</b></>}
      </p>
      {rest.length > 0 && (
        <ul className="bibs-next">
          {rest.slice(0, 3).map((b) => (
            <li key={b.day} className={b.player_id === meId ? "me" : ""}><span>{fmtShort(b.day)}</span> {bibName(b)}{b.player_id === meId && " · tu"}</li>
          ))}
        </ul>
      )}
      {!mine && myNext && !rest.slice(0, 3).some((b) => b.player_id === meId) && <p className="muted small" style={{ margin: "6px 0 0" }}>A tu et tocarà el {fmtShort(myNext.day)}.</p>}
    </section>
  );
}

/** Staff: qui els porta cada dia de la setmana, canviar-ho a mà i on comença l'ordre. */
export function BibsAdmin({ weekStart, onChanged }: { weekStart: string; onChanged?: () => void }) {
  const [list, setList] = useState<BibDay[] | null>(null);
  const [players, setPlayers] = useState<{ id: string; name: string; dorsal: number | null }[]>([]);
  const [cfg, setCfg] = useState<BibSettings | null>(null);
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchBibs(weekStart, addDays(weekStart, 6)).then(setList, (e) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }));
  }, [weekStart, version]);
  useEffect(() => {
    fetchBibPlayers().then(setPlayers, () => {});
    fetchBibSettings().then(setCfg, () => {});
  }, [version]);

  const label = (p: { name: string; dorsal: number | null }) => `${p.dorsal != null ? `${p.dorsal} · ` : ""}${p.name}`;
  const done = (text: string) => {
    setMsg({ ok: true, text });
    setVersion((v) => v + 1);
    onChanged?.();
  };

  async function setDay(day: string, pid: string) {
    setBusy(true);
    const sb = supabase();
    const { error } = pid
      ? await sb.from("bib_overrides").upsert({ day, player_id: pid, updated_at: new Date().toISOString() }).select("day").single()
      : await sb.from("bib_overrides").delete().eq("day", day);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: `No s'ha pogut desar: ${error.message}` });
    done(pid ? "Desat ✓ L'ordre continua a partir d'ella." : "Desat ✓ Torna a l'ordre normal.");
  }
  async function setStart(start_date: string, start_player: string) {
    if (!start_date || !start_player) return;
    setBusy(true);
    const { data, error } = await supabase().from("bib_settings").update({ start_date, start_player, updated_at: new Date().toISOString() }).eq("id", true).select("start_date").maybeSingle();
    setBusy(false);
    if (error || !data) return setMsg({ ok: false, text: `No s'ha pogut desar: ${error?.message ?? "torna-ho a provar"}` });
    done("Desat ✓ L'ordre dels petos comença aquí.");
  }

  return (
    <section className="card bibs-admin">
      <h2 style={{ marginTop: 0 }}>🦺 Petos</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Cada dia d&apos;entreno o partit els porta una jugadora, per ordre de dorsal. Si a la llista consta absent (o està lesionada), li toca a la següent.
      </p>
      {msg && <p className={`msg${msg.ok ? "" : " error"}`}>{msg.text}</p>}
      {list && list.length === 0 && <p className="muted">Aquesta setmana no hi ha cap sessió (o encara no s&apos;ha triat on comença l&apos;ordre).</p>}
      {list && list.length > 0 && (
        <ul className="bibs-week">
          {list.map((b) => (
            <li key={b.day}>
              <span>{fmtShort(b.day)}</span>
              <select value={b.player_id} disabled={busy} onChange={(e) => setDay(b.day, e.target.value)} aria-label={`Qui porta els petos el ${fmtShort(b.day)}`}>
                {players.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
              </select>
              {b.manual && <button type="button" className="btn small secondary" disabled={busy} onClick={() => setDay(b.day, "")}>Treure el canvi</button>}
            </li>
          ))}
        </ul>
      )}
      {cfg && (
        <details className="bibs-start">
          <summary>On comença l&apos;ordre</summary>
          <StartForm cfg={cfg} players={players} label={label} busy={busy} onSave={setStart} />
        </details>
      )}
    </section>
  );
}

function StartForm({ cfg, players, label, busy, onSave }: {
  cfg: BibSettings;
  players: { id: string; name: string; dorsal: number | null }[];
  label: (p: { name: string; dorsal: number | null }) => string;
  busy: boolean;
  onSave: (d: string, p: string) => void;
}) {
  const [d, setD] = useState(cfg.start_date ?? "");
  const [p, setP] = useState(cfg.start_player ?? "");
  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} aria-label="Primer dia" style={{ width: "auto" }} />
      <select value={p} onChange={(e) => setP(e.target.value)} aria-label="Primera jugadora" style={{ width: "auto" }}>
        <option value="">— Tria la jugadora —</option>
        {players.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
      </select>
      <button type="button" className="btn small" disabled={busy || !d || !p} onClick={() => onSave(d, p)}>Desar</button>
    </div>
  );
}
