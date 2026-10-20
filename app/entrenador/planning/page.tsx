"use client";

import { useEffect, useState } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { WeekDays } from "@/components/weekly-view";
import { addDays, startOfWeek, weekRange } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import {
  ACTIVITIES, DEFAULT_FOOTER, ICONS, MAX_ITEMS, MAX_TEXT, dayTitle, draftFromCalendar, emptyWeek, fetchWeeklyPlan, sortItems, toWhatsApp,
  type PlanDay, type PlanItem, type WeeklyPlan,
} from "@/lib/weekly";
import { fmtDateTime, todayMadrid } from "@/lib/wellness";

export default function PlanningPage() {
  return (
    <>
      <CoachShell>{() => <Planning />}</CoachShell>
      <Footer />
    </>
  );
}

type Draft = { days: PlanDay[]; footer: string; published: boolean; published_at: string | null };

function Planning() {
  const thisWeek = startOfWeek(todayMadrid());
  const [week, setWeek] = useState(() => {
    const w = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("w") : null;
    return w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? startOfWeek(w) : thisWeek;
  });
  const [saved, setSaved] = useState<WeeklyPlan | null | undefined>(undefined); // undefined = carregant
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let off = false;
    window.history.replaceState(null, "", week === thisWeek ? window.location.pathname : `?w=${week}`);
    fetchWeeklyPlan(week).then(
      (p) => {
        if (off) return;
        setSaved(p);
        setDraft(p ? { days: p.days, footer: p.footer ?? "", published: p.published, published_at: p.published_at } : null);
        setDirty(false);
      },
      (e) => {
        if (off) return;
        setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
        setSaved(null);
      },
    );
    return () => {
      off = true;
    };
  }, [week, thisWeek]);

  // Avisa si es tanca la pàgina amb canvis sense desar.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function changeWeek(w: string) {
    if (w === week) return;
    if (dirty && !window.confirm("Hi ha canvis sense desar. Canviar de setmana igualment?")) return;
    setSaved(undefined);
    setDraft(null);
    setDirty(false);
    setStatus(null);
    setWeek(w);
  }
  const goWeek = (n: number) => changeWeek(addDays(week, n * 7));

  const start = (days: PlanDay[], footer = DEFAULT_FOOTER) => {
    setDraft({ days, footer, published: false, published_at: null });
    setDirty(true);
  };
  async function fromCalendar() {
    setBusy(true);
    try {
      start(await draftFromCalendar(week), draft?.footer || DEFAULT_FOOTER);
      setStatus({ ok: true, text: "Proposta feta amb el calendari i les convocatòries. Revisa-la i desa." });
    } catch (e) {
      setStatus({ ok: false, text: `No s'ha pogut llegir el calendari: ${e instanceof Error ? e.message : e}` });
    } finally {
      setBusy(false);
    }
  }
  async function copyPrevious() {
    setBusy(true);
    try {
      const prev = await fetchWeeklyPlan(addDays(week, -7));
      if (!prev) return setStatus({ ok: false, text: "La setmana anterior no té planning." });
      start(prev.days, prev.footer ?? DEFAULT_FOOTER);
      setStatus({ ok: true, text: "Copiat de la setmana anterior. Revisa les hores i desa." });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const upd = (patch: Partial<Draft>) => {
    setDraft((d) => d && { ...d, ...patch });
    setDirty(true);
    setStatus(null);
  };
  const updDay = (i: number, patch: Partial<PlanDay>) => draft && upd({ days: draft.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const updItem = (i: number, k: number, patch: Partial<PlanItem>) =>
    draft && updDay(i, { items: draft.days[i].items.map((it, j) => (j === k ? { ...it, ...patch } : it)) });

  /** Desa (i publica o despublica). Només diu "Desat" quan el servidor ho confirma. */
  async function save(published: boolean) {
    if (!draft) return;
    setBusy(true);
    setStatus(null);
    const days = draft.days.map((d) => ({
      rest: d.rest,
      items: sortItems(
        d.items
          .map((it) => ({ t: it.t, ...(it.e ? { e: it.e } : {}), icon: it.icon, text: it.text.trim().slice(0, MAX_TEXT) }))
          .filter((it) => it.text || it.t),
      ),
    }));
    const row = { week_start: week, days, footer: draft.footer.trim().slice(0, 300) || null, published };
    const { data, error } = await supabase().from("weekly_plans").upsert(row).select("week_start, published, published_at, updated_at").maybeSingle();
    setBusy(false);
    if (error || !data) return setStatus({ ok: false, text: `No s'ha pogut desar: ${error?.message ?? "torna-ho a provar"}` });
    setDraft({ ...draft, days, published: data.published as boolean, published_at: data.published_at as string | null });
    setSaved({ week_start: week, days, footer: row.footer, published: data.published as boolean, published_at: data.published_at as string | null, updated_at: data.updated_at as string });
    setDirty(false);
    if (published && !draft.published) return notify(false, "Publicat ✓ Les jugadores ja el veuen a l'app.");
    setStatus({ ok: true, text: published ? "Desat ✓ Les jugadores ja veuen els canvis. Si vols que els mirin, toca «🔔 Avisar dels canvis»." : draft.published ? "Desat ✓ Ja no és visible per a les jugadores." : "Desat ✓ (encara no publicat)" });
  }

  /** Avís al mòbil de les jugadores (les que tenen les notificacions activades). */
  async function notify(changed: boolean, prefix = "") {
    setBusy(true);
    try {
      const { data: s } = await supabase().auth.getSession();
      const res = await fetch("/api/push/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ week_start: week, changed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setStatus({ ok: true, text: `${prefix ? `${prefix} ` : ""}Avís enviat a ${json.sent} ${json.sent === 1 ? "mòbil" : "mòbils"}. (Només el reben les jugadores que tenen els avisos activats.)` });
    } catch (e) {
      setStatus({ ok: false, text: `${prefix ? `${prefix} Però l'avís` : "L'avís"} no s'ha pogut enviar: ${e instanceof Error ? e.message : e}` });
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    if (!draft) return;
    const text = toWhatsApp(week, draft.days, draft.footer);
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ ok: true, text: "Text copiat. Ja el pots enganxar al WhatsApp." });
    } catch {
      setPreview(true);
      setStatus({ ok: false, text: "No s'ha pogut copiar sol: selecciona el text de sota i copia'l." });
    }
  }

  return (
    <>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Planning de la setmana</h1>
        {draft && <span className={`chip${draft.published ? "" : " muted"}`}>{draft.published ? "Publicat" : "Esborrany"}</span>}
      </div>
      <div className="wk-nav">
        <button type="button" className="btn small secondary" onClick={() => goWeek(-1)} aria-label="Setmana anterior">‹</button>
        <div>
          <b>{weekRange(week)}</b>
          {week === thisWeek && <span className="muted small"> · aquesta setmana</span>}
          {week === addDays(thisWeek, 7) && <span className="muted small"> · la setmana que ve</span>}
        </div>
        <button type="button" className="btn small secondary" onClick={() => goWeek(1)} aria-label="Setmana següent">›</button>
      </div>
      {week !== thisWeek && <button type="button" className="btn small secondary" onClick={() => changeWeek(thisWeek)} style={{ marginBottom: 8 }}>Tornar a aquesta setmana</button>}

      {status && <p className={`msg${status.ok ? "" : " error"}`}>{status.text}</p>}
      {saved === undefined && <p className="muted">Carregant…</p>}

      {saved !== undefined && !draft && (
        <section className="card stack">
          <p style={{ margin: 0 }}>Aquesta setmana encara no té planning. Com vols començar?</p>
          <button type="button" className="btn" disabled={busy} onClick={fromCalendar}>📅 Omplir amb el calendari i les convocatòries</button>
          <button type="button" className="btn secondary" disabled={busy} onClick={copyPrevious}>⧉ Copiar la setmana anterior</button>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => start(emptyWeek())}>Començar en blanc</button>
        </section>
      )}

      {draft && (
        <>
          <div className="row" style={{ gap: 6, margin: "8px 0" }}>
            <button type="button" className="btn small secondary" disabled={busy} onClick={() => window.confirm("Tornar a fer la proposta amb el calendari? Es perdran els canvis d'aquesta setmana.") && fromCalendar()}>📅 Refer amb el calendari</button>
            <button type="button" className="btn small secondary" disabled={busy} onClick={() => window.confirm("Substituir-ho per la setmana anterior?") && copyPrevious()}>⧉ Copiar setmana anterior</button>
            <button type="button" className="btn small secondary" onClick={() => setPreview((v) => !v)}>{preview ? "Editar" : "👁 Com ho veuen"}</button>
          </div>

          {preview ? (
            <>
              <WeekDays weekStart={week} days={draft.days} footer={draft.footer} />
              <h2 style={{ marginTop: 18 }}>Text per al WhatsApp</h2>
              <textarea className="wk-wa" readOnly value={toWhatsApp(week, draft.days, draft.footer)} onFocus={(e) => e.currentTarget.select()} />
            </>
          ) : (
            draft.days.map((d, i) => (
              <section key={i} className={`card wk-edit${d.rest ? " rest" : ""}`}>
                <div className="row between">
                  <h2 style={{ margin: 0 }}>{dayTitle(week, i)}</h2>
                  <label className="wk-rest-toggle"><input type="checkbox" checked={d.rest} onChange={(e) => updDay(i, { rest: e.target.checked })} /> Descans 😴</label>
                </div>
                {!d.rest && (
                  <>
                    {d.items.map((it, k) => (
                      <div key={k} className="wk-item">
                        <input type="time" value={it.t} onChange={(e) => updItem(i, k, { t: e.target.value })} aria-label="Hora" />
                        <input type="time" value={it.e ?? ""} onChange={(e) => updItem(i, k, { e: e.target.value || undefined })} aria-label="Fins a (opcional)" title="Fins a (opcional)" />
                        <select value={it.icon} onChange={(e) => updItem(i, k, { icon: e.target.value })} aria-label="Icona">
                          {[...new Set([it.icon, ...ICONS])].filter(Boolean).map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                          <option value="">—</option>
                        </select>
                        <input type="text" value={it.text} maxLength={MAX_TEXT} onChange={(e) => updItem(i, k, { text: e.target.value })} aria-label="Què es fa" placeholder="Què es fa" />
                        <button type="button" className="an-ic" aria-label="Treure" onClick={() => updDay(i, { items: d.items.filter((_, j) => j !== k) })}>✕</button>
                      </div>
                    ))}
                    {d.items.length < MAX_ITEMS && (
                      <select
                        className="wk-add"
                        value=""
                        aria-label="Afegir una activitat"
                        onChange={(e) => {
                          const a = ACTIVITIES[Number(e.target.value)];
                          if (a) updDay(i, { items: [...d.items, { t: "", icon: a.icon, text: a.text }] });
                        }}
                      >
                        <option value="">+ Afegir activitat…</option>
                        {ACTIVITIES.map((a, n) => <option key={n} value={n}>{a.icon} {a.text.trim()}</option>)}
                      </select>
                    )}
                  </>
                )}
              </section>
            ))
          )}

          <section className="card">
            <label className="field" htmlFor="wkfoot">Nota final (surt a baix, en majúscules al WhatsApp)</label>
            <input id="wkfoot" type="text" maxLength={300} value={draft.footer} onChange={(e) => upd({ footer: e.target.value })} />
          </section>

          <div className="wk-actions">
            <span className="muted small">{dirty ? "Canvis sense desar" : draft.published_at ? `Publicat el ${fmtDateTime(draft.published_at)}` : saved ? "Desat" : ""}</span>
            <button type="button" className="btn secondary" disabled={busy} onClick={copyText}>📋 Copiar per WhatsApp</button>
            {draft.published ? (
              <>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => save(false)}>Despublicar</button>
                {!dirty && <button type="button" className="btn secondary" disabled={busy} onClick={() => window.confirm("Enviar un avís a les jugadores dient que hi ha canvis al planning?") && notify(true)}>🔔 Avisar dels canvis</button>}
                <button type="button" className="btn" disabled={busy || !dirty} onClick={() => save(true)}>Desar</button>
              </>
            ) : (
              <>
                <button type="button" className="btn secondary" disabled={busy || !dirty} onClick={() => save(false)}>Desar esborrany</button>
                <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>Publicar i avisar</button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
