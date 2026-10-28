"use client";

import { useEffect, useState } from "react";
import { deleteNotice, fetchNotices, NOTICE_REASONS, noticeOpen, saveNotice, type Notice } from "@/lib/absence";
import { reasonLabel, type AbsenceReason } from "@/lib/attendance";
import type { Session } from "@/lib/wellness";

/** «No podré venir»: la jugadora avisa d'una baixa a un entreno (als partits no surt). */
export function AbsenceButton({ session, meId, onChange }: { session: Session; meId: string; onChange?: () => void }) {
  const [notice, setNotice] = useState<Notice | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AbsenceReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canEdit = noticeOpen(session);

  useEffect(() => {
    let alive = true;
    fetchNotices([session.id]).then((l) => alive && setNotice(l.find((n) => n.player_id === meId) ?? null), () => alive && setNotice(null));
    return () => { alive = false; };
  }, [session.id, meId]);

  if (session.kind !== "Entrenament" || session.cancelled || notice === undefined) return null;
  if (!notice && !canEdit) return null;

  async function send() {
    if (!reason) return setErr("Tria el motiu.");
    setBusy(true); setErr(null);
    try {
      setNotice(await saveNotice(session.id, reason, note));
      setOpen(false);
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }
  async function undo() {
    setBusy(true); setErr(null);
    try {
      await deleteNotice(session.id, meId);
      setNotice(null); setReason(null); setNote("");
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (notice) {
    return (
      <div className="absence done" role="status">
        <span>🙋‍♀️ Has avisat que no vindràs · <b>{reasonLabel(notice.reason)}</b></span>
        {canEdit && <button type="button" className="linkbtn" disabled={busy} onClick={undo}>Desfer</button>}
        {err && <span className="msg error">{err}</span>}
      </div>
    );
  }
  if (!open) {
    return <button type="button" className="btn small secondary absence-open" onClick={() => setOpen(true)}>No podré venir</button>;
  }
  return (
    <div className="absence">
      <span className="small"><b>Per què no podràs venir?</b> Només ho veurà el cos tècnic.</span>
      <div className="absence-reasons" role="group" aria-label="Motiu">
        {NOTICE_REASONS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={reason === k} onClick={() => setReason(k)}>{label}</button>
        ))}
      </div>
      <input type="text" maxLength={120} placeholder="Vols afegir alguna cosa? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota (opcional)" />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn small" disabled={busy || !reason} onClick={send}>{busy ? "Avisant…" : "Avisar"}</button>
        <button type="button" className="btn small secondary" disabled={busy} onClick={() => { setOpen(false); setErr(null); }}>Cancel·lar</button>
      </div>
      {err && <span className="msg error">{err}</span>}
    </div>
  );
}
