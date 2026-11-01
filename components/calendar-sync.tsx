"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

/** «Afegir al meu calendari»: subscripció amb els entrenos i partits (s'actualitza sola quan hi ha canvis). */
export function CalendarSync() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function open() {
    setBusy(true); setErr(null);
    const { data, error } = await supabase().rpc("my_calendar_token");
    setBusy(false);
    if (error || typeof data !== "string") return setErr(error?.message ?? "No s'ha pogut preparar.");
    setUrl(`${window.location.host}/api/calendar?t=${data}`);
  }
  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(`https://${url}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no es pot copiar */ }
  }

  return (
    <section className="card cal-sync">
      <div className="cal-sync-head">
        <span aria-hidden="true">📅</span>
        <div>
          <b>Al calendari del mòbil</b>
          <span className="muted small">Els entrenos i els partits al teu calendari (iPhone, Google…). Si canvia alguna hora, s&apos;actualitza sol.</span>
        </div>
      </div>
      {!url ? (
        <button type="button" className="btn small" disabled={busy} onClick={open}>{busy ? "Preparant…" : "Afegir al meu calendari"}</button>
      ) : (
        <div className="cal-sync-opts">
          <a className="btn small" href={`webcal://${url}`}>📱 iPhone / Mac</a>
          <a className="btn small secondary" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${url}`)}`} target="_blank" rel="noreferrer">Google Calendar</a>
          <button type="button" className="btn small secondary" onClick={copy}>{copied ? "Copiat ✓" : "Copiar l'enllaç"}</button>
          <p className="muted small" style={{ margin: 0 }}>És el teu enllaç personal: no el comparteixis.</p>
        </div>
      )}
      {err && <p className="msg error">{err}</p>}
    </section>
  );
}
