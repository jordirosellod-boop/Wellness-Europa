"use client";

import { useCallback, useEffect, useState } from "react";
import { daysLeftInMonth, fetchLeague, fetchTeamLevel, fetchWinners, LeagueTable, leagueTitle, LevelBadge, Winners, type LeagueRow, type LeagueWinner } from "@/components/league";
import { supabase } from "@/lib/supabase";
import { friendlyError, todayMadrid } from "@/lib/wellness";

/** Mini apartat: nivell de compromís de l'equip. */
export function LevelEditor() {
  const [level, setLevel] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchTeamLevel().then(setLevel, (e) => setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : String(e)) }));
  }, []);

  async function save(n: number | null) {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase()
      .from("team_settings")
      .update({ commitment_level: n, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("commitment_level")
      .maybeSingle();
    setBusy(false);
    if (error || !data) return setMsg({ ok: false, text: friendlyError(error?.message ?? "No s'ha pogut desar.") });
    setLevel(data.commitment_level as number | null);
    setMsg({ ok: true, text: n ? `Desat: l'equip està al Nivell ${n}. Les jugadores ja ho veuen.` : "Nivell amagat." });
  }

  if (level === undefined) return null;
  return (
    <section className="card stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Nivell de compromís</h2>
        <LevelBadge level={level} />
      </div>
      <div className="toggle three" role="group" aria-label="Nivell de compromís">
        {[1, 2, 3].map((n) => (
          <button key={n} type="button" aria-pressed={level === n} disabled={busy} onClick={() => save(n)}>
            Nivell {n}
          </button>
        ))}
      </div>
      {level != null && (
        <button type="button" className="linkbtn" disabled={busy} onClick={() => save(null)}>Amagar el nivell</button>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </section>
  );
}

/** Lliga interna: sumar/restar punts d'un en un, o posar-los directament. */
export function LeagueEditor() {
  const [rows, setRows] = useState<LeagueRow[] | null>(null);
  const [winners, setWinners] = useState<LeagueWinner[]>([]);
  const today = todayMadrid();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(
    () => fetchLeague().then(setRows, (e) => setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : String(e)) })),
    [],
  );
  useEffect(() => {
    load();
    fetchWinners().then(setWinners, () => {});
  }, [load]);

  async function add(r: LeagueRow, delta: number) {
    setBusy(r.profile_id);
    setMsg(null);
    const { data, error } = await supabase().rpc("league_add", { pid: r.profile_id, delta });
    setBusy(null);
    if (error || data == null) return setMsg({ ok: false, text: friendlyError(error?.message ?? "No s'ha pogut desar.") });
    // Només es canvia a la pantalla quan el servidor ho ha confirmat.
    setRows((prev) => prev?.map((x) => (x.profile_id === r.profile_id ? { ...x, points: data as number } : x)) ?? prev);
  }

  async function saveAll() {
    if (!rows) return;
    const changes = rows
      .map((r) => ({ r, v: draft[r.profile_id] }))
      .filter(({ r, v }) => v !== undefined && v !== "" && Number(v) !== r.points);
    for (const { v } of changes) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return setMsg({ ok: false, text: "Els punts han de ser nombres enters a partir de 0." });
    }
    setBusy("all");
    setMsg(null);
    for (const { r, v } of changes) {
      const { error } = await supabase().rpc("league_set", { pid: r.profile_id, value: Number(v) });
      if (error) {
        setBusy(null);
        await load();
        return setMsg({ ok: false, text: `${r.display_name}: ${friendlyError(error.message)}` });
      }
    }
    setBusy(null);
    setEditing(false);
    setDraft({});
    await load();
    setMsg({ ok: true, text: changes.length ? `Classificació desada (${changes.length} canvis).` : "No hi havia canvis." });
  }

  if (!rows) return msg ? <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p> : null;

  return (
    <section className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{leagueTitle(today)}</h2>
        {!editing ? (
          <button className="btn small secondary" onClick={() => setEditing(true)}>Escriure punts</button>
        ) : (
          <button className="btn small secondary" onClick={() => { setEditing(false); setDraft({}); }}>Tancar</button>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Toca + o − per sumar o restar d&apos;un en un. Cada mes és una lliga nova: el dia 1 tothom torna a 0 i la primera del mes queda com a
        guanyadora. Queden {daysLeftInMonth(today)} dies. Les fletxes indiquen qui ha pujat o baixat des d&apos;ahir.
      </p>
      {editing ? (
        <div className="stack">
          {[...rows].sort((a, b) => a.display_name.localeCompare(b.display_name, "ca")).map((r) => (
            <div key={r.profile_id} className="row between" style={{ flexWrap: "nowrap" }}>
              <label htmlFor={`pts-${r.profile_id}`} style={{ flex: 1 }}>{r.display_name}</label>
              <input
                id={`pts-${r.profile_id}`}
                type="text"
                inputMode="numeric"
                style={{ width: 90, textAlign: "center" }}
                value={draft[r.profile_id] ?? String(r.points)}
                onChange={(e) => setDraft((d) => ({ ...d, [r.profile_id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
              />
            </div>
          ))}
          <button className="btn block" disabled={busy === "all"} onClick={saveAll}>{busy === "all" ? "Desant…" : "Desar la classificació"}</button>
        </div>
      ) : (
        <LeagueTable
          rows={rows}
          actions={(r) => (
            <>
              <button className="pt-btn" aria-label={`Treure 1 punt a ${r.display_name}`} disabled={busy === r.profile_id || r.points === 0} onClick={() => add(r, -1)}>−</button>
              <button className="pt-btn plus" aria-label={`Sumar 1 punt a ${r.display_name}`} disabled={busy === r.profile_id} onClick={() => add(r, 1)}>+</button>
            </>
          )}
        />
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
      <h3 style={{ marginTop: 18 }}>Guanyadores</h3>
      <Winners winners={winners} />
    </section>
  );
}
