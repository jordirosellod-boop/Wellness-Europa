"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/wellness";

export type Status = "loading" | "unsupported" | "ios-home" | "denied" | "off" | "on";

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function detect(): Promise<Status> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "ios-home" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

const TEXT = {
  player: {
    title: "Avisos al mòbil",
    off: "Rep un avís a les 7:30 els dies d'entrenament per omplir el wellness, la vigília si et toquen els petos, el dilluns si el teu grup porta el material o les porteries, i 2 hores abans de la quedada els dies de partit.",
    on: "Rebràs els avisos de wellness (7:30), petos, material i porteries, i de la quedada dels partits.",
    done: "Fet! Rebràs els avisos de wellness, petos, material i partits.",
  },
  staff: {
    title: "Resum setmanal al mòbil",
    off: "Rep cada diumenge al vespre un resum de la setmana: assistència, wellness, RPE i lesionades.",
    on: "Rebràs el resum de la setmana cada diumenge al vespre.",
    done: "Fet! Rebràs el resum cada diumenge al vespre.",
  },
} as const;

/** Botó per activar els avisos al mòbil (jugadores: recordatoris; staff: resum setmanal). */
export function Reminders({ staff = false }: { staff?: boolean } = {}) {
  const t = TEXT[staff ? "staff" : "player"];
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    detect().then(setStatus, () => setStatus("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const res = await fetch("/api/push/key", { cache: "no-store" });
      const { publicKey, error } = await res.json();
      if (!publicKey) throw new Error(error ?? "No s'ha pogut obtenir la clau.");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) }));
      const json = sub.toJSON();
      // Esperem la confirmació del servidor abans de dir que està activat.
      const { data, error: dbErr } = await supabase()
        .from("push_subscriptions")
        .upsert({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }, { onConflict: "endpoint" })
        .select("id")
        .maybeSingle();
      if (dbErr || !data) {
        await sub.unsubscribe().catch(() => {});
        throw new Error(dbErr?.message ?? "No s'ha confirmat.");
      }
      setStatus("on");
      setMsg({ ok: true, text: t.done });
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
      setMsg({ ok: true, text: "Avisos desactivats en aquest mòbil." });
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return null;

  return (
    <section className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t.title}</h2>
        {status === "on" && <span className="chip fet">Activat</span>}
      </div>
      {status === "off" && (
        <>
          <p className="muted small">{t.off}</p>
          <button className="btn block" disabled={busy} onClick={enable}>{busy ? "Activant…" : "Activar avisos"}</button>
        </>
      )}
      {status === "on" && (
        <>
          <p className="muted small">{t.on}</p>
          <button className="btn small secondary" disabled={busy} onClick={disable}>Desactivar</button>
        </>
      )}
      {status === "ios-home" && (
        <div className="small">
          <p style={{ marginTop: 8 }}>A l&apos;iPhone, els avisos només funcionen si afegeixes l&apos;app a la pantalla d&apos;inici:</p>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            <li>Toca el botó <b>Compartir</b> (el quadrat amb la fletxa) del Safari.</li>
            <li>Tria <b>Afegir a la pantalla d&apos;inici</b>.</li>
            <li>Obre l&apos;app des de la nova icona i toca <b>Activar avisos</b>.</li>
          </ol>
        </div>
      )}
      {status === "denied" && (
        <p className="muted small">Has bloquejat els avisos per a aquesta app. Pots tornar-los a permetre als ajustos del mòbil (Notificacions).</p>
      )}
      {status === "unsupported" && (
        <p className="muted small">Aquest navegador no permet avisos. Prova-ho amb Chrome (Android) o afegint l&apos;app a la pantalla d&apos;inici (iPhone).</p>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </section>
  );
}
