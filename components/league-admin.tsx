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

/** Lliga interna: punts i entrenaments de cada jugadora (− / + d'un en un, o escrivint-los). */
export function LeagueEditor() {
  const [rows, setRows] = useState<LeagueRow[] | null>(null);
  const [winners, setWinners] = useState<LeagueWinner[]>([]);
  const today = todayMadrid();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, { p?: string; t?: string }>>({});
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

  async function change(r: LeagueRow, field: "points" | "trainings", delta: number) {
    setBusy(`${r.profile_id}:${field}`);
    setMsg(null);
    const { data, error } = await supabase().rpc("league_change", { pid: r.profile_id, field, delta });
    setBusy(null);
    if (error || data == null) return setMsg({ ok: false, text: friendlyError(error?.message ?? "No s'ha pogut desar.") });
    // Només es canvia a la pantalla quan el servidor ho ha confirmat.
    setRows((prev) => prev?.map((x) => (x.profile_id === r.profile_id ? { ...x, [field]: data as number } : x)) ?? prev);
  }

  async function saveAll() {
    if (!rows) return;
    const changes = rows
      .map((r) => {
        const d = draft[r.profile_id] ?? {};
        const p = d.p === undefined || d.p === "" ? r.points : Number(d.p);
        const t = d.t === undefined || d.t === "" ? r.trainings : Number(d.t);
        return { r, p, t };
      })
      .filter(({ r, p, t }) => p !== r.points || t !== r.trainings);
    for (const { p, t } of changes) {
      if (!Number.isInteger(p) || p < 0 || p > 100000 || !Number.isInteger(t) || t < 0 || t > 100)
        return setMsg({ ok: false, text: "Els punts i els entrenaments han de ser nombres enters a partir de 0." });
    }
    setBusy("all");
    setMsg(null);
    for (const { r, p, t } of changes) {
      const { error } = await supabase().rpc("league_set", { pid: r.profile_id, new_points: p, new_trainings: t });
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
  const min = rows[0]?.min_trainings ?? 6;

  const stepper = (r: LeagueRow, field: "points" | "trainings", label: string) => (
    <span className="mini-stepper">
      <span className="mini-label">{label}</span>
      <button className="pt-btn" aria-label={`Treure 1 ${field === "points" ? "punt" : "entrenament"} a ${r.display_name}`} disabled={busy === `${r.profile_id}:${field}` || r[field] === 0} onClick={() => change(r, field, -1)}>−</button>
      <b>{r[field]}</b>
      <button className="pt-btn plus" aria-label={`Sumar 1 ${field === "points" ? "punt" : "entrenament"} a ${r.display_name}`} disabled={busy === `${r.profile_id}:${field}`} onClick={() => change(r, field, 1)}>+</button>
    </span>
  );

  return (
    <section className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{leagueTitle(today)}</h2>
        {!editing ? (
          <button className="btn small secondary" onClick={() => setEditing(true)}>Escriure</button>
        ) : (
          <button className="btn small secondary" onClick={() => { setEditing(false); setDraft({}); }}>Tancar</button>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Promig = punts ÷ entrenaments. Per classificar-se calen <b>{min} entrenaments</b> al mes; guanya el millor promig. Cada mes és una lliga
        nova (el dia 1 tot torna a 0). Queden {daysLeftInMonth(today)} dies.
      </p>
      <p className="msg info small" style={{ marginTop: 0 }}>
        Els entrenaments se sumen sols quan passes llista a <b>Llista</b> (cada «Present» a un entrenament = +1). Fes servir − / + només per
        corregir.
      </p>
      {editing ? (
        <div className="stack">
          <div className="row between muted small" style={{ flexWrap: "nowrap" }}>
            <span style={{ flex: 1 }}>Jugadora</span>
            <span style={{ width: 74, textAlign: "center" }}>Punts</span>
            <span style={{ width: 74, textAlign: "center" }}>Entrenos</span>
          </div>
          {[...rows].sort((a, b) => a.display_name.localeCompare(b.display_name, "ca")).map((r) => (
            <div key={r.profile_id} className="row between" style={{ flexWrap: "nowrap" }}>
              <span style={{ flex: 1, minWidth: 0 }}>{r.display_name}</span>
              <input
                aria-label={`Punts de ${r.display_name}`}
                type="text"
                inputMode="numeric"
                style={{ width: 74, textAlign: "center" }}
                value={draft[r.profile_id]?.p ?? String(r.points)}
                onChange={(e) => setDraft((d) => ({ ...d, [r.profile_id]: { ...d[r.profile_id], p: e.target.value.replace(/\D/g, "").slice(0, 6) } }))}
              />
              <input
                aria-label={`Entrenaments de ${r.display_name}`}
                type="text"
                inputMode="numeric"
                style={{ width: 74, textAlign: "center" }}
                value={draft[r.profile_id]?.t ?? String(r.trainings)}
                onChange={(e) => setDraft((d) => ({ ...d, [r.profile_id]: { ...d[r.profile_id], t: e.target.value.replace(/\D/g, "").slice(0, 3) } }))}
              />
            </div>
          ))}
          <button className="btn block" disabled={busy === "all"} onClick={saveAll}>{busy === "all" ? "Desant…" : "Desar la classificació"}</button>
        </div>
      ) : (
        <LeagueTable rows={rows} actions={(r) => (<>{stepper(r, "points", "Pts")}{stepper(r, "trainings", "Entr.")}</>)} />
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
      <h3 style={{ marginTop: 18 }}>Guanyadores</h3>
      <Winners winners={winners} />
    </section>
  );
}
