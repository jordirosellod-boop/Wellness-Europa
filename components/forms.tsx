"use client";

import { useState, type FormEvent } from "react";
import { Scale } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  bandOf,
  fmtTime,
  friendlyError,
  RPE_LABELS,
  WELLNESS_VARS,
  type Rpe,
  type Wellness,
  type WellnessKey,
} from "@/lib/wellness";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "ok"; text: string } | { kind: "error"; text: string };

function savedText(row: { submitted_at: string; updated_at: string }) {
  const sent = fmtTime(row.submitted_at);
  const edited = fmtTime(row.updated_at);
  return sent === edited ? `Desat! Enviat a les ${sent}.` : `Desat! Enviat a les ${sent}, modificat a les ${edited}.`;
}

export function WellnessForm({
  sessionId,
  existing,
  editable,
  onSaved,
}: {
  sessionId: string;
  existing: Wellness | null;
  editable: boolean;
  onSaved: (w: Wellness) => void;
}) {
  const [vals, setVals] = useState<Record<WellnessKey, number | null>>({
    sleep: existing?.sleep ?? null,
    fatigue: existing?.fatigue ?? null,
    mood: existing?.mood ?? null,
  });
  const [hasPain, setHasPain] = useState(existing?.has_pain ?? false);
  const [pain, setPain] = useState(existing?.pain_description ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const touched = () => status.kind !== "saving" && setStatus({ kind: "idle" });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (WELLNESS_VARS.some((v) => vals[v.key] == null)) {
      setStatus({ kind: "error", text: "Respon les tres preguntes (toca un número a cada una)." });
      return;
    }
    if (hasPain && !pain.trim()) {
      setStatus({ kind: "error", text: "Descriu la molèstia o el dolor (on i com és)." });
      return;
    }
    setStatus({ kind: "saving" });
    const payload = {
      sleep: vals.sleep,
      fatigue: vals.fatigue,
      mood: vals.mood,
      has_pain: hasPain,
      pain_description: hasPain ? pain.trim() : null,
      notes: notes.trim() || null,
    };
    try {
      // Esperem la resposta del servidor: només diem "Desat!" si retorna la fila desada.
      const res = existing
        ? await supabase().from("wellness").update(payload).eq("id", existing.id).select().maybeSingle()
        : await supabase().from("wellness").insert({ ...payload, session_id: sessionId }).select().maybeSingle();
      if (res.error) throw new Error(res.error.message);
      if (!res.data) throw new Error("row-level security");
      onSaved(res.data as Wellness);
      setStatus({ kind: "ok", text: savedText(res.data as Wellness) });
    } catch (err) {
      setStatus({ kind: "error", text: friendlyError(err instanceof Error ? err.message : String(err)) });
    }
  }

  const all = WELLNESS_VARS.every((v) => vals[v.key] != null);
  const preview = all ? Math.round(((vals.sleep! + vals.fatigue! + vals.mood!) / 3) * 10) / 10 : null;

  return (
    <form className="stack" onSubmit={save}>
      {WELLNESS_VARS.map((v) => (
        <div key={v.key}>
          <label className="field">{v.label}</label>
          <Scale
            label={v.label}
            min={1}
            max={10}
            low={v.low}
            high={v.high}
            value={vals[v.key]}
            disabled={!editable}
            onChange={(n) => {
              setVals((p) => ({ ...p, [v.key]: n }));
              touched();
            }}
          />
        </div>
      ))}

      <label className="check">
        <input
          type="checkbox"
          checked={hasPain}
          disabled={!editable}
          onChange={(e) => {
            setHasPain(e.target.checked);
            touched();
          }}
        />
        Tinc alguna molèstia o dolor
      </label>
      {hasPain && (
        <div>
          <label className="field" htmlFor="pain">On i com és? (obligatori)</label>
          <textarea
            id="pain"
            maxLength={500}
            required
            disabled={!editable}
            value={pain}
            onChange={(e) => {
              setPain(e.target.value);
              touched();
            }}
          />
        </div>
      )}
      <div>
        <label className="field" htmlFor="wnotes">Notes (opcional)</label>
        <textarea
          id="wnotes"
          maxLength={500}
          disabled={!editable}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            touched();
          }}
        />
      </div>

      {preview != null && (
        <p className="muted">
          Puntuació: <b>{preview.toFixed(1)}</b> <span className={`chip ${bandOf(preview).cls}`}>{bandOf(preview).label}</span>
        </p>
      )}

      {editable && (
        <button className="btn block" disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "Desant…" : existing ? "Desar canvis" : "Enviar wellness"}
        </button>
      )}
      {status.kind === "ok" && <p className="msg ok" role="status">✓ {status.text}</p>}
      {status.kind === "error" && <p className="msg error" role="alert">{status.text}</p>}
    </form>
  );
}

export function RpeForm({
  sessionId,
  plannedDuration,
  existing,
  editable,
  onSaved,
}: {
  sessionId: string;
  plannedDuration: number | null;
  existing: Rpe | null;
  editable: boolean;
  onSaved: (r: Rpe) => void;
}) {
  const [value, setValue] = useState<number | null>(existing?.rpe ?? null);
  const [duration, setDuration] = useState<string>(String(existing?.duration_min ?? plannedDuration ?? ""));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (value == null) {
      setStatus({ kind: "error", text: "Toca un número de 0 a 10." });
      return;
    }
    if (minutes == null) {
      setStatus({ kind: "error", text: "Indica quants minuts ha durat la sessió (d'1 a 300)." });
      return;
    }
    setStatus({ kind: "saving" });
    const payload = { rpe: value, duration_min: minutes, notes: notes.trim() || null };
    try {
      const res = existing
        ? await supabase().from("rpe").update(payload).eq("id", existing.id).select().maybeSingle()
        : await supabase().from("rpe").insert({ ...payload, session_id: sessionId }).select().maybeSingle();
      if (res.error) throw new Error(res.error.message);
      if (!res.data) throw new Error("row-level security");
      onSaved(res.data as Rpe);
      setStatus({ kind: "ok", text: savedText(res.data as Rpe) });
    } catch (err) {
      setStatus({ kind: "error", text: friendlyError(err instanceof Error ? err.message : String(err)) });
    }
  }

  const parsed = Number(duration);
  const minutes = Number.isInteger(parsed) && parsed >= 1 && parsed <= 300 ? parsed : null;
  const step = (d: number) => {
    const base = minutes ?? plannedDuration ?? 60;
    setDuration(String(Math.min(300, Math.max(5, Math.round((base + d) / 5) * 5))));
    setStatus({ kind: "idle" });
  };

  return (
    <form className="stack" onSubmit={save}>
      <div>
        <label className="field">Quin esforç t&apos;ha suposat la sessió?</label>
        <Scale
          label="RPE"
          min={0}
          max={10}
          low="Repòs"
          high="Màxim"
          value={value}
          disabled={!editable}
          onChange={(n) => {
            setValue(n);
            setStatus({ kind: "idle" });
          }}
        />
        {value != null && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {value} = <b>{RPE_LABELS[value]}</b>
          </p>
        )}
      </div>
      <div>
        <label className="field" htmlFor="rdur">Durada real (minuts)</label>
        <div className="stepper">
          <button type="button" aria-label="5 minuts menys" disabled={!editable} onClick={() => step(-5)}>−</button>
          <input
            id="rdur"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={!editable}
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value.replace(/\D/g, "").slice(0, 3));
              setStatus({ kind: "idle" });
            }}
          />
          <button type="button" aria-label="5 minuts més" disabled={!editable} onClick={() => step(5)}>+</button>
        </div>
        {value != null && minutes != null && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Càrrega: {value} × {minutes} min = <b>{value * minutes}</b> UA
          </p>
        )}
      </div>
      <div>
        <label className="field" htmlFor="rnotes">Notes (opcional)</label>
        <textarea
          id="rnotes"
          maxLength={500}
          disabled={!editable}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setStatus({ kind: "idle" });
          }}
        />
      </div>
      {editable && (
        <button className="btn block" disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "Desant…" : existing ? "Desar canvis" : "Enviar RPE"}
        </button>
      )}
      {status.kind === "ok" && <p className="msg ok" role="status">✓ {status.text}</p>}
      {status.kind === "error" && <p className="msg error" role="alert">{status.text}</p>}
    </form>
  );
}
