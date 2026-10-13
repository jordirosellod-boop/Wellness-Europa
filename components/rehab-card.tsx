"use client";

import { useEffect, useState } from "react";
import { Scale } from "@/components/ui";
import { activeOn, fetchInjuries, fetchRehab, REHAB_COLS, REHAB_KINDS, type Injury, type RehabEntry, type RehabKind } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";
import { dayBefore, fmtDate, fmtTime, friendlyError, RPE_LABELS, WELLNESS_VARS } from "@/lib/wellness";

type Msg = { ok: boolean; text: string } | null;

/** Carrega si la jugadora està lesionada avui o ahir i els seus entrenaments a part d'aquests dies. */
export async function loadRehabState(meId: string, today: string) {
  const [inj, entries] = await Promise.all([fetchInjuries(meId), fetchRehab(dayBefore(today), today, meId)]);
  return { injuries: inj, entries };
}

/**
 * Entrenament a part (només per a lesionades): wellness abans i RPE després.
 * Surt només si la jugadora consta com a lesionada avui (o ahir, per fer l'RPE tard).
 */
export function RehabCard({ meId, today }: { meId: string; today: string }) {
  const [state, setState] = useState<{ injuries: Injury[]; entries: RehabEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(today);

  useEffect(() => {
    loadRehabState(meId, today).then(setState, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [meId, today]);

  if (error) return <p className="msg error">{friendlyError(error)}</p>;
  if (!state) return null;
  const yesterday = dayBefore(today);
  const days = [today, yesterday].filter((d) => state.injuries.some((i) => activeOn(i, d)));
  if (days.length === 0) return null;
  const current = days.includes(day) ? day : days[0];
  const entry = state.entries.find((e) => e.entry_date === current) ?? null;

  return (
    <section className="card rehab-card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Entrenament a part</h2>
        <span className="chip band-alerta">Lesionada</span>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        Si avui fas recuperació, readaptació o fisio a part, omple el wellness abans i l&apos;RPE després.
      </p>
      {days.length > 1 && (
        <div className="tabs" style={{ marginBottom: 10 }}>
          {days.map((d) => (
            <button key={d} aria-pressed={d === current} onClick={() => setDay(d)}>{d === today ? "Avui" : "Ahir"}</button>
          ))}
        </div>
      )}
      <RehabForm
        key={`${current}-${entry?.id ?? "new"}`}
        date={current}
        today={today}
        entry={entry}
        onSaved={(e) => setState((s) => s && { ...s, entries: [...s.entries.filter((x) => x.entry_date !== e.entry_date), e] })}
      />
    </section>
  );
}

function RehabForm({ date, today, entry, onSaved }: { date: string; today: string; entry: RehabEntry | null; onSaved: (e: RehabEntry) => void }) {
  const [kind, setKind] = useState<RehabKind>(entry?.kind ?? "Recuperació");
  const [w, setW] = useState({ sleep: entry?.sleep ?? null, fatigue: entry?.fatigue ?? null, mood: entry?.mood ?? null } as Record<"sleep" | "fatigue" | "mood", number | null>);
  const [pain, setPain] = useState<number | null>(entry?.pain ?? null);
  const [rpe, setRpe] = useState<number | null>(entry?.rpe ?? null);
  const [dur, setDur] = useState<number>(entry?.duration_min ?? 45);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [busy, setBusy] = useState<"w" | "r" | null>(null);
  const [msgW, setMsgW] = useState<Msg>(null);
  const [msgR, setMsgR] = useState<Msg>(null);

  /** Desa i només diu "Desat" si el servidor ho ha confirmat. */
  async function save(part: "w" | "r") {
    const set = part === "w" ? setMsgW : setMsgR;
    set(null);
    if (part === "w" && (w.sleep == null || w.fatigue == null || w.mood == null || pain == null))
      return set({ ok: false, text: "Respon totes les preguntes (toca un número a cada una)." });
    if (part === "r" && rpe == null) return set({ ok: false, text: "Tria l'esforç (de 0 a 10)." });
    setBusy(part);
    const payload =
      part === "w"
        ? { kind, sleep: w.sleep, fatigue: w.fatigue, mood: w.mood, pain, notes: notes.trim() || null }
        : { kind, rpe, duration_min: dur, notes: notes.trim() || null };
    const sb = supabase();
    const res = entry
      ? await sb.from("rehab_entries").update(payload).eq("id", entry.id).select(REHAB_COLS).maybeSingle()
      : await sb.from("rehab_entries").insert({ entry_date: date, ...payload }).select(REHAB_COLS).maybeSingle();
    setBusy(null);
    if (res.error || !res.data) {
      const m = res.error?.message ?? "";
      return set({ ok: false, text: /row-level|permission/i.test(m) ? "No s'ha pogut desar: aquest dia no consta que estiguis lesionada (o ja és massa tard)." : friendlyError(m || "No s'ha pogut desar.") });
    }
    onSaved(res.data as RehabEntry);
    set({ ok: true, text: `Desat a les ${fmtTime(new Date().toISOString())}.` });
  }

  return (
    <div className="stack">
      {date !== today && <p className="msg warn" style={{ margin: 0 }}>Entrenament a part d&apos;ahir ({fmtDate(date)}).</p>}
      <div>
        <label className="field">Què fas avui?</label>
        <div className="weekdays wrap" role="group" aria-label="Tipus d'entrenament a part">
          {REHAB_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>
          ))}
        </div>
      </div>

      <h3 style={{ margin: "8px 0 0" }}>
        Wellness <span className="muted small">(abans)</span>
        {entry?.wellness_at && <span className="chip fet" style={{ marginLeft: 8 }}>Enviat {fmtTime(entry.wellness_at)}</span>}
      </h3>
      {WELLNESS_VARS.map((v) => (
        <div key={v.key}>
          <label className="field">{v.label}</label>
          <Scale value={w[v.key]} onChange={(n) => setW((x) => ({ ...x, [v.key]: n }))} min={1} max={10} low={v.low} high={v.high} label={v.label} />
        </div>
      ))}
      <div>
        <label className="field">Dolor de la lesió</label>
        <Scale value={pain} onChange={setPain} min={0} max={10} low="Gens" high="Màxim" label="Dolor de la lesió" />
      </div>
      <button className="btn block" disabled={busy != null} onClick={() => save("w")}>{busy === "w" ? "Desant…" : "Enviar wellness"}</button>
      {msgW && <p className={`msg ${msgW.ok ? "ok" : "error"}`} role="status">{msgW.text}</p>}

      <h3 style={{ margin: "14px 0 0" }}>
        RPE <span className="muted small">(després)</span>
        {entry?.rpe_at && <span className="chip fet" style={{ marginLeft: 8 }}>Enviat {fmtTime(entry.rpe_at)}</span>}
      </h3>
      <div>
        <label className="field">Quin esforç t&apos;ha suposat?</label>
        <Scale value={rpe} onChange={setRpe} min={0} max={10} low={RPE_LABELS[0]} high={RPE_LABELS[10]} label="RPE" />
      </div>
      <div>
        <label className="field">Durada (minuts)</label>
        <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
          <button type="button" className="btn small secondary" onClick={() => setDur((d) => Math.max(5, d - 5))} aria-label="Menys minuts">−</button>
          <input type="text" inputMode="numeric" value={dur} onChange={(e) => setDur(Math.min(300, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))} style={{ textAlign: "center" }} aria-label="Durada en minuts" />
          <button type="button" className="btn small secondary" onClick={() => setDur((d) => Math.min(300, d + 5))} aria-label="Més minuts">+</button>
        </div>
      </div>
      <div>
        <label className="field" htmlFor="rnotes">Notes (opcional)</label>
        <textarea id="rnotes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn block" disabled={busy != null} onClick={() => save("r")}>{busy === "r" ? "Desant…" : "Enviar RPE"}</button>
      {msgR && <p className={`msg ${msgR.ok ? "ok" : "error"}`} role="status">{msgR.text}</p>}
    </div>
  );
}
