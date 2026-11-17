"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { detect, enablePush } from "@/components/reminders";
import { ClubIcon } from "@/components/club-icons";

const KEY = "benvinguda-vista";

const SLIDES = [
  { icon: null, k: "Benvinguda a", t: "JUVENIL C", d: "L'app del teu equip: entrenos, partits, convocatòries i tot el que passa al vestidor." },
  { icon: "avui" as const, k: "Cada dia", t: "WELLNESS I RPE", d: "Abans d'entrenar, com has dormit i com estàs (20 segons). Després, com de dur ha estat. Així el staff et cuida millor." },
  { icon: "reunio" as const, k: "Sempre al dia", t: "AVISOS AL MÒBIL", d: "Convocatòria, petos, canvis d'entreno i gols en directe. Activa'ls perquè no se t'escapi res." },
];

/** La primera vegada que una jugadora obre l'app: tres pantalles amb l'escut i, al final, activar els avisos. */
export function Welcome() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [push, setPush] = useState<string | null>(null);
  useEffect(() => {
    let seen = true;
    try { seen = !!localStorage.getItem(KEY); } catch { /* sense emmagatzematge: no molestem */ }
    if (seen) return;
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, []);
  if (!open || typeof document === "undefined") return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* res */ } setOpen(false); };
  const last = i === SLIDES.length - 1;
  async function activate() {
    try {
      const st = await detect();
      if (st === "ios-home") return setPush("A l'iPhone, primer afegeix l'app a la pantalla d'inici (Compartir › Afegir a la pantalla d'inici) i obre-la des d'allà.");
      if (st === "unsupported") return setPush("Aquest mòbil no permet avisos des de l'app.");
      const r = await enablePush();
      if (r === "on") { setPush("Avisos activats ✓"); setTimeout(close, 900); }
      else setPush(r === "denied" ? "Has dit que no. Ho pots canviar més endavant a Avisos." : "No s'han activat. Ho pots fer més endavant a Avisos.");
    } catch (e) {
      setPush(`No s'han pogut activar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const s = SLIDES[i];
  return createPortal(
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Benvinguda">
      <div className="wl-slide" key={i}>
        {s.icon ? <span className="wl-ico"><ClubIcon name={s.icon} size={64} /></span> : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="wl-crest" src="/escut.png" alt="" width={130} height={130} />
        )}
        <span className="wl-k">{s.k}</span>
        <b className="wl-t">{s.t}</b>
        <p className="wl-d">{s.d}</p>
      </div>
      <div className="wl-dots" aria-hidden="true">{SLIDES.map((_, j) => <i key={j} className={j === i ? "on" : ""} />)}</div>
      {push && <p className="wl-msg" role="status">{push}</p>}
      <div className="wl-actions">
        {last ? (
          <>
            <button type="button" className="wl-go" onClick={() => void activate()}>🔔 Activar els avisos</button>
            <button type="button" className="wl-skip" onClick={close}>Ara no</button>
          </>
        ) : (
          <>
            <button type="button" className="wl-go" onClick={() => setI(i + 1)}>Següent</button>
            <button type="button" className="wl-skip" onClick={close}>Saltar</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
