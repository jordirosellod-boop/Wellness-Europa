"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { downloadText, sessionCsv } from "@/lib/csv";
import { fetchAll, supabase } from "@/lib/supabase";
import {
  alertsOf,
  average,
  bandOf,
  fmtDate,
  fmtSessionTime,
  fmtTime,
  RPE_LABELS,
  shortLabel,
  WELLNESS_VARS,
  type Profile,
  type Rpe,
  type Session,
  type Wellness,
} from "@/lib/wellness";

export default function SessionDetailPage() {
  return (
    <>
      <CoachShell>
        {() => (
          <Suspense fallback={<p className="muted">Carregant…</p>}>
            <Detail />
          </Suspense>
        )}
      </CoachShell>
      <Footer />
    </>
  );
}

type Row = { player: Profile; w: Wellness | null; r: Rpe | null };

async function fetchDetail(id: string): Promise<{ session: Session | null; rows: Row[] }> {
  const sb = supabase();
  const { data: s, error: sErr } = await sb
    .from("sessions")
    .select("id, session_date, start_time, kind, name")
    .eq("id", id)
    .maybeSingle();
  if (sErr && !/uuid/i.test(sErr.message)) throw new Error(sErr.message);
  if (!s) return { session: null, rows: [] };
  // Sempre filtrat per sessió i paginat amb ordre fix: mai es perden files pel límit de 1.000.
  const [players, wellness, rpe] = await Promise.all([
    fetchAll<Profile>((f, t) =>
      sb.from("profiles").select("id, role, display_name").eq("role", "player").order("display_name").order("id").range(f, t),
    ),
    fetchAll<Wellness>((f, t) => sb.from("wellness").select("*").eq("session_id", id).order("id").range(f, t)),
    fetchAll<Rpe>((f, t) => sb.from("rpe").select("*").eq("session_id", id).order("id").range(f, t)),
  ]);
  const wBy = new Map(wellness.map((w) => [w.player_id, w]));
  const rBy = new Map(rpe.map((r) => [r.player_id, r]));
  return {
    session: s as Session,
    rows: players.map((p) => ({ player: p, w: wBy.get(p.id) ?? null, r: rBy.get(p.id) ?? null })),
  };
}

function Detail() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      fetchDetail(id)
        .then(
          (res) => {
            setSession(res.session);
            setRows(res.rows);
            setLoadedAt(new Date().toISOString());
          },
          (e) => setError(e instanceof Error ? e.message : String(e)),
        )
        .finally(() => setBusy(false)),
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function refresh() {
    setBusy(true);
    setError(null);
    void load();
  }

  async function remove() {
    if (!session) return;
    if (!confirm(`Segur que vols esborrar "${session.name}"? S'esborraran també tots els wellness i RPE d'aquesta sessió.`)) return;
    const { data, error } = await supabase().from("sessions").delete().eq("id", session.id).select("id");
    if (error || !data?.length) return setError(error?.message ?? "No s'ha pogut esborrar la sessió.");
    router.replace("/entrenador");
  }

  if (error) return <p className="msg error">{error}</p>;
  if (session === undefined) return <p className="muted">Carregant…</p>;
  if (session === null) return <p className="msg error">No s&apos;ha trobat la sessió.</p>;

  const ws = rows.flatMap((x) => (x.w ? [Number(x.w.score)] : []));
  const rs = rows.flatMap((x) => (x.r ? [x.r.rpe] : []));
  const wAvg = average(ws);
  const rAvg = average(rs);
  const withAlerts = rows.filter((x) => x.w && (alertsOf(x.w).length > 0 || x.w.has_pain)).length;
  const pendingW = rows.filter((x) => !x.w).map((x) => x.player.display_name);
  const pendingR = rows.filter((x) => !x.r).map((x) => x.player.display_name);

  function exportCsv() {
    const safe = session!.name.normalize("NFD").replace(/[^\w-]+/g, "_").slice(0, 40);
    downloadText(`wellness_${session!.session_date}_${safe}.csv`, sessionCsv(session!, rows));
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <h1 style={{ margin: 0 }}>{session.name}</h1>
          <span className="chip">{session.kind}</span>
        </div>
        <p className="muted" style={{ margin: "4px 0 12px" }}>
          {fmtDate(session.session_date, { year: true })}
          {session.start_time ? ` · ${fmtSessionTime(session.start_time)}` : ""}
        </p>
        <div className="stats">
          <div className="stat">
            Wellness mitjà
            <b>{wAvg == null ? "–" : wAvg.toFixed(1)}</b>
            {wAvg != null && <span className={`chip ${bandOf(wAvg).cls}`}>{bandOf(wAvg).label}</span>}
          </div>
          <div className="stat">
            RPE mitjà
            <b>{rAvg == null ? "–" : rAvg.toFixed(1)}</b>
          </div>
          <div className="stat">
            Respostes
            <b>{ws.length}/{rows.length}</b>
            <span className="small">wellness · RPE {rs.length}/{rows.length}</span>
          </div>
          <div className="stat">
            Amb alerta o molèstia
            <b style={{ color: withAlerts ? "var(--vermell)" : undefined }}>{withAlerts}</b>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={exportCsv}>⬇ Descarregar Excel (CSV)</button>
          <button className="btn secondary" onClick={refresh} disabled={busy}>{busy ? "Actualitzant…" : "↻ Actualitzar"}</button>
        </div>
        {loadedAt && <p className="muted small" style={{ marginBottom: 0 }}>Dades de les {fmtTime(loadedAt)}.</p>}
      </div>

      {(pendingW.length > 0 || pendingR.length > 0) && (
        <div className="card">
          <h2>Pendents</h2>
          {pendingW.length > 0 && (
            <p style={{ margin: "0 0 6px" }}>
              <span className="chip pendent">Wellness ({pendingW.length})</span> {pendingW.join(", ")}
            </p>
          )}
          {pendingR.length > 0 && (
            <p style={{ margin: 0 }}>
              <span className="chip pendent">RPE ({pendingR.length})</span> {pendingR.join(", ")}
            </p>
          )}
        </div>
      )}

      <h2>Jugadores ({rows.length})</h2>
      {rows.length === 0 && <p className="muted">Encara no has creat cap jugadora (pestanya Equip).</p>}
      {rows.map(({ player, w, r }) => {
        const alerts = w ? alertsOf(w) : [];
        return (
          <div key={player.id} className={`player${alerts.length || w?.has_pain ? " has-alert" : ""}`}>
            <div className="row between">
              <b>{player.display_name}</b>
              {w ? (
                <span className={`chip ${bandOf(Number(w.score)).cls}`}>
                  {Number(w.score).toFixed(1)} · {bandOf(Number(w.score)).label}
                </span>
              ) : (
                <span className="chip pendent">Wellness pendent</span>
              )}
            </div>
            {w && (
              <>
                <div className="line">
                  {WELLNESS_VARS.map((v, i) => (
                    <span key={v.key}>
                      {i > 0 && " · "}
                      {shortLabel(v)} <span className={w[v.key] < 5 ? "val-alert" : ""}>{w[v.key]}</span>
                    </span>
                  ))}
                  <span className="muted"> · {fmtTime(w.submitted_at)}{w.updated_at !== w.submitted_at && fmtTime(w.updated_at) !== fmtTime(w.submitted_at) ? ` (editat ${fmtTime(w.updated_at)})` : ""}</span>
                </div>
                {alerts.length > 0 && (
                  <div className="line alert">⚠ Alerta: {alerts.map((a) => `${a.label} (${a.value})`).join(", ")}</div>
                )}
                {w.has_pain && <div className="pain">🩹 Molèstia: {w.pain_description}</div>}
                {w.notes && <div className="line muted">Nota: {w.notes}</div>}
              </>
            )}
            <div className="line">
              {r ? (
                <>
                  <b>RPE {r.rpe}</b> <span className="muted">({RPE_LABELS[r.rpe]}) · {fmtTime(r.submitted_at)}</span>
                  {r.notes && <div className="muted">Nota: {r.notes}</div>}
                </>
              ) : (
                <span className="chip pendent">RPE pendent</span>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 24 }}>
        <button className="btn danger" onClick={remove}>Esborrar sessió</button>
      </div>
    </>
  );
}
