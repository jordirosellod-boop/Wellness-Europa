"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConvoSheet } from "@/components/convo-sheet";
import { LineupBoard } from "@/components/pitch";
import { CoachShell, Footer } from "@/components/ui";
import { CONVO_COLS, fetchConvocations, fetchRoster, hhmm, type Convocation, type RosterRow } from "@/lib/convo";
import { addDays } from "@/lib/dates";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, todayMadrid } from "@/lib/wellness";

export default function ConvoPage() {
  return (
    <>
      <CoachShell>{() => <Convos />}</CoachShell>
      <Footer />
    </>
  );
}

function Convos() {
  const today = todayMadrid();
  const [list, setList] = useState<Convocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    (select?: string) =>
      fetchConvocations(addDays(today, -60)).then(
        (l) => {
          setList(l);
          setSelected((cur) => select ?? (l.some((c) => c.id === cur) ? cur : (l.find((c) => c.match_date >= today) ?? l[l.length - 1])?.id ?? null));
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      ),
    [today],
  );
  useEffect(() => {
    load();
  }, [load]);

  const current = list?.find((c) => c.id === selected) ?? null;

  return (
    <>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Convocatòria</h1>
        <button className="btn small" onClick={() => setCreating((v) => !v)}>{creating ? "Tancar" : "+ Nova"}</button>
      </div>
      {error && <p className="msg error">{error}</p>}
      {creating && (
        <ConvoForm
          onSaved={(id) => {
            setCreating(false);
            load(id);
          }}
        />
      )}
      {!list && !error && <p className="muted">Carregant…</p>}
      {list?.length === 0 && !creating && <p className="card">Encara no hi ha cap convocatòria. Toca «+ Nova».</p>}
      {list && list.length > 0 && (
        <div className="tabs convo-tabs" style={{ margin: "12px 0" }}>
          {list.map((c) => (
            <button key={c.id} aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
              {c.match_date.slice(8, 10)}/{c.match_date.slice(5, 7)} · {c.rival}
              {!c.published && " ·  esborrany"}
            </button>
          ))}
        </div>
      )}
      {current && <ConvoEditor key={current.id} c={current} onChanged={() => load()} onDeleted={() => load()} />}
    </>
  );
}

type FcfNext = { acta_id: string; jornada: number; kickoff: string | null; home: string; away: string; is_home: boolean };

function shortTeam(name: string) {
  return name.replace(/,?\s+(C\.E\.|U\.E\.|C\.F\.|A\.D\.|C\.D\.|U\.D\.|F\.C\.)\s*/g, " ").replace(/\s+[A-Z]$/, "").replace(/\s+/g, " ").trim();
}

/** Formulari de la informació del partit (nova o editar). */
function ConvoForm({ c, onSaved }: { c?: Convocation; onSaved: (id: string) => void }) {
  const [f, setF] = useState({
    rival: c?.rival ?? "",
    is_home: c?.is_home ?? true,
    match_date: c?.match_date ?? todayMadrid(),
    kickoff: hhmm(c?.kickoff ?? null),
    meet_time: hhmm(c?.meet_time ?? null),
    competition: c?.competition ?? "Lliga",
    venue: c?.venue ?? "",
    address: c?.address ?? "",
    kit: c?.kit ?? "",
    notes: c?.notes ?? "",
  });
  const [fcf, setFcf] = useState<FcfNext[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (c) return;
    const sb = supabase();
    fetchAll<FcfNext>((a, b) =>
      sb.from("fcf_matches").select("acta_id, jornada, kickoff, home, away, is_home").eq("closed", false).order("jornada").order("acta_id").range(a, b),
    ).then((l) => setFcf(l.slice(0, 6)), () => {});
  }, [c]);

  function fromFcf(id: string) {
    const m = fcf.find((x) => x.acta_id === id);
    if (!m) return;
    const kick = m.kickoff ?? "";
    setF((x) => ({
      ...x,
      rival: shortTeam(m.is_home ? m.away : m.home),
      is_home: m.is_home,
      match_date: kick ? kick.slice(0, 10) : x.match_date,
      kickoff: kick ? kick.slice(11, 16) : x.kickoff,
      competition: `Lliga · Jornada ${m.jornada}`,
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.rival.trim()) return setMsg("Posa el nom del rival.");
    setBusy(true);
    setMsg(null);
    const row = {
      rival: f.rival.trim(),
      is_home: f.is_home,
      match_date: f.match_date,
      kickoff: f.kickoff || null,
      meet_time: f.meet_time || null,
      competition: f.competition.trim() || null,
      venue: f.venue.trim() || null,
      address: f.address.trim() || null,
      kit: f.kit.trim() || null,
      notes: f.notes.trim() || null,
    };
    const sb = supabase();
    const { data, error } = c
      ? await sb.from("convocations").update(row).eq("id", c.id).select("id").maybeSingle()
      : await sb.from("convocations").insert(row).select("id").maybeSingle();
    setBusy(false);
    if (error || !data) return setMsg(`No s'ha pogut desar: ${error?.message ?? "torna-ho a provar"}`);
    onSaved(data.id as string);
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 style={{ margin: 0 }}>{c ? "Informació del partit" : "Nova convocatòria"}</h2>
      {!c && fcf.length > 0 && (
        <div>
          <label className="field" htmlFor="cfcf">Omplir amb un partit de la FCF</label>
          <select id="cfcf" defaultValue="" onChange={(e) => fromFcf(e.target.value)}>
            <option value="">— Tria un partit —</option>
            {fcf.map((m) => (
              <option key={m.acta_id} value={m.acta_id}>
                J{m.jornada} · {shortTeam(m.home)} – {shortTeam(m.away)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 2 }}>
          <label className="field" htmlFor="crival">Rival</label>
          <input id="crival" type="text" maxLength={80} value={f.rival} onChange={(e) => set("rival", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field">Som</label>
          <div className="weekdays" role="group" aria-label="Local o visitant">
            <button type="button" aria-pressed={f.is_home} onClick={() => set("is_home", true)}>Local</button>
            <button type="button" aria-pressed={!f.is_home} onClick={() => set("is_home", false)}>Visit.</button>
          </div>
        </div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1.3 }}>
          <label className="field" htmlFor="cdate">Dia</label>
          <input id="cdate" type="date" required value={f.match_date} onChange={(e) => set("match_date", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="cmeet">Quedada</label>
          <input id="cmeet" type="time" value={f.meet_time} onChange={(e) => set("meet_time", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="ckick">Partit</label>
          <input id="ckick" type="time" value={f.kickoff} onChange={(e) => set("kickoff", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field" htmlFor="cvenue">Camp</label>
        <input id="cvenue" type="text" maxLength={120} placeholder="Ex.: Nou Sardenya" value={f.venue} onChange={(e) => set("venue", e.target.value)} />
      </div>
      <div>
        <label className="field" htmlFor="caddr">Adreça (opcional)</label>
        <input id="caddr" type="text" maxLength={200} value={f.address} onChange={(e) => set("address", e.target.value)} />
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="ckit">Equipació</label>
          <input id="ckit" type="text" maxLength={80} placeholder="Ex.: Blava (1a)" value={f.kit} onChange={(e) => set("kit", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field" htmlFor="ccomp">Competició</label>
          <input id="ccomp" type="text" maxLength={80} value={f.competition} onChange={(e) => set("competition", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field" htmlFor="cnotes">Notes (opcional)</label>
        <textarea id="cnotes" maxLength={500} placeholder="Ex.: Porteu DNI i espinilleres" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <button className="btn block" disabled={busy}>{busy ? "Desant…" : c ? "Desar canvis" : "Crear convocatòria"}</button>
      {msg && <p className="msg error" role="status">{msg}</p>}
    </form>
  );
}

function ConvoEditor({ c, onChanged, onDeleted }: { c: Convocation; onChanged: () => void; onDeleted: () => void }) {
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editInfo, setEditInfo] = useState(false);
  const [dorsals, setDorsals] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetchRoster(c.id).then(setRoster, (e) => setError(e instanceof Error ? e.message : String(e))), [c.id]);
  useEffect(() => {
    load();
  }, [load]);

  /** Convoca o desconvoca; la pantalla canvia només quan el servidor ho confirma. */
  async function setCalled(ids: string[], called: boolean) {
    if (!ids.length) return;
    setMsg(null);
    setSaving((s) => new Set([...s, ...ids]));
    const { data, error: e } = await supabase()
      .from("convocation_players")
      .upsert(ids.map((player_id) => ({ convocation_id: c.id, player_id, called, updated_at: new Date().toISOString() })), { onConflict: "convocation_id,player_id" })
      .select("player_id, called");
    setSaving((s) => new Set([...s].filter((x) => !ids.includes(x))));
    if (e || !data || data.length !== ids.length) return setMsg({ ok: false, text: `No s'ha pogut desar: ${e?.message ?? "torna-ho a provar"}` });
    const done = new Map((data as { player_id: string; called: boolean }[]).map((x) => [x.player_id, x.called]));
    setRoster((r) => r && r.map((x) => (done.has(x.player_id) ? { ...x, called: done.get(x.player_id)! } : x)));
  }

  async function setDorsal(pid: string, raw: string) {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v != null && (!Number.isInteger(v) || v < 0 || v > 99)) return setMsg({ ok: false, text: "El dorsal ha de ser un número del 0 al 99." });
    const sb = supabase();
    const { error: e } = v == null
      ? await sb.from("player_numbers").delete().eq("profile_id", pid)
      : await sb.from("player_numbers").upsert({ profile_id: pid, dorsal: v, updated_at: new Date().toISOString() }).select("profile_id").single();
    if (e) return setMsg({ ok: false, text: `No s'ha pogut desar el dorsal: ${e.message}` });
    await load();
  }

  async function publish(on: boolean) {
    setBusy(true);
    setMsg(null);
    const { data, error: e } = await supabase().from("convocations").update({ published: on }).eq("id", c.id).select(CONVO_COLS).maybeSingle();
    if (e || !data) {
      setBusy(false);
      return setMsg({ ok: false, text: `No s'ha pogut ${on ? "publicar" : "despublicar"}: ${e?.message ?? "torna-ho a provar"}` });
    }
    if (on) await notify(true);
    setBusy(false);
    onChanged();
  }

  async function notify(afterPublish = false) {
    setBusy(true);
    try {
      const { data: s } = await supabase().auth.getSession();
      const res = await fetch("/api/push/convo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ id: c.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setMsg({
        ok: true,
        text: `${afterPublish ? "Publicada! " : ""}Avís enviat a ${json.sent} ${json.sent === 1 ? "mòbil" : "mòbils"}. (Només el reben les jugadores que tenen els avisos activats.)`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `${afterPublish ? "Publicada, però l'avís no s'ha pogut enviar" : "No s'ha pogut enviar l'avís"}: ${e instanceof Error ? e.message : e}` });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Esborrar la convocatòria contra ${c.rival}? També s'esborra l'onze.`)) return;
    const { data, error: e } = await supabase().from("convocations").delete().eq("id", c.id).select("id");
    if (e || !data?.length) return setMsg({ ok: false, text: `No s'ha pogut esborrar: ${e?.message ?? "torna-ho a provar"}` });
    onDeleted();
  }

  if (error) return <p className="msg error">{error}</p>;
  if (!roster) return <p className="muted">Carregant…</p>;
  const calledN = roster.filter((r) => r.called).length;

  return (
    <>
      <section className="card">
        <div className="row between">
          <div>
            <b>{c.is_home ? `CE Europa – ${c.rival}` : `${c.rival} – CE Europa`}</b>
            <div className="muted small">{fmtDate(c.match_date)}{c.kickoff ? ` · ${hhmm(c.kickoff)} h` : ""}</div>
          </div>
          {c.published ? <span className="chip fet">Publicada</span> : <span className="chip pendent">Esborrany</span>}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          {!c.published ? (
            <button className="btn" disabled={busy} onClick={() => publish(true)}>{busy ? "Publicant…" : "📣 Publicar i avisar"}</button>
          ) : (
            <>
              <button className="btn small" disabled={busy} onClick={() => notify()}>📣 Tornar a avisar</button>
              <button className="btn small secondary" disabled={busy} onClick={() => publish(false)}>Despublicar</button>
            </>
          )}
          <button className="btn small secondary" onClick={() => setEditInfo((v) => !v)}>{editInfo ? "Tancar" : "Editar info"}</button>
          <button className="btn small secondary" onClick={remove}>Esborrar</button>
        </div>
        {c.published && <p className="muted small" style={{ marginBottom: 0 }}>Els canvis de la llista es veuen a l&apos;instant a l&apos;app de les jugadores.</p>}
        {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
      </section>

      {editInfo && (
        <ConvoForm
          c={c}
          onSaved={() => {
            setEditInfo(false);
            onChanged();
          }}
        />
      )}

      <section className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Llista <span className="muted small">{calledN} de {roster.length}</span></h2>
          <button className="btn small secondary" onClick={() => setDorsals((v) => !v)}>{dorsals ? "Fet" : "Dorsals"}</button>
        </div>
        <div className="row" style={{ gap: 8, margin: "10px 0" }}>
          <button className="btn small" disabled={saving.size > 0} onClick={() => setCalled(roster.filter((r) => !r.called).map((r) => r.player_id), true)}>Convocar totes</button>
          <button className="btn small secondary" disabled={saving.size > 0} onClick={() => setCalled(roster.filter((r) => r.called).map((r) => r.player_id), false)}>Desconvocar totes</button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>Toca una jugadora per convocar-la o desconvocar-la.</p>
        <ul className="convo-toggle">
          {[...roster].sort((a, b) => a.display_name.localeCompare(b.display_name, "ca")).map((r) => (
            <li key={r.player_id}>
              {dorsals ? (
                <label className="dorsal-edit">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`Dorsal de ${r.display_name}`}
                    defaultValue={r.dorsal ?? ""}
                    maxLength={2}
                    onBlur={(e) => e.target.value !== String(r.dorsal ?? "") && setDorsal(r.player_id, e.target.value)}
                  />
                  <span>{r.display_name}</span>
                </label>
              ) : (
                <button
                  type="button"
                  className={r.called ? "on" : ""}
                  aria-pressed={r.called}
                  disabled={saving.has(r.player_id)}
                  onClick={() => setCalled([r.player_id], !r.called)}
                >
                  <b>{r.dorsal ?? "·"}</b>
                  <span>{r.display_name}</span>
                  <i aria-hidden="true">{saving.has(r.player_id) ? "…" : r.called ? "✓" : ""}</i>
                </button>
              )}
            </li>
          ))}
        </ul>
        {dorsals && <p className="muted small">Escriu el dorsal i surt de la casella per desar-lo. Si el deixes buit, es fa servir el de la FCF.</p>}
      </section>

      <LineupBoard c={c} roster={roster} />

      <section className="card no-print">
        <h2>Vista de les jugadores</h2>
        <ConvoSheet c={c} roster={roster} />
      </section>
    </>
  );
}
