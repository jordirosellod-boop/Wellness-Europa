"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { KitNumber } from "@/components/player-grid";
import { kitFont } from "@/lib/fonts";

export type Zoomed = { row: { player_id: string; display_name: string; dorsal: number | null; origin?: string | null }; photo: string };

/** La fitxa gran d'una convocada: la foto ve creixent des del seu quadradet (veure convo-sheet). */
export function PlayerZoom({ z, gk, onClose }: { z: Zoomed; gk?: boolean; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const [first, ...rest] = z.row.display_name.trim().split(/\s+/);
  return createPortal(
    <div className={`pz ${kitFont.variable}`} role="dialog" aria-modal="true" aria-label={z.row.display_name} onClick={onClose}>
      <figure className={`pz-card${gk ? " gk" : ""}`} onClick={(e) => e.stopPropagation()}>
        <button ref={close} type="button" className="pz-close" onClick={onClose} aria-label="Tancar">✕</button>
        {z.row.dorsal != null && <span className="pz-num" aria-hidden="true">{z.row.dorsal}</span>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pz-photo" src={z.photo} alt="" />
        <figcaption>
          <KitNumber n={z.row.dorsal} />
          <span className="pz-name"><b>{first}</b>{rest.length > 0 && <span>{rest.join(" ")}</span>}</span>
          {z.row.origin && <small>{z.row.origin}</small>}
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}
