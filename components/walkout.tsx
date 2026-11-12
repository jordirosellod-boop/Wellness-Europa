"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Crest } from "@/components/crest";
import { hhmm, type Convocation } from "@/lib/convo";
import { isoDow } from "@/lib/dates";
import { haptic } from "@/lib/feel";
import { kitFont } from "@/lib/fonts";

const DOW = ["", "Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"];

/**
 * «Walkout»: la primera vegada que una convocada obre la convocatòria, l'estadi s'enfosqueix, s'encenen els focus
 * i surt el seu dorsal en daurat amb «ESTÀS CONVOCADA». Es tanca sol o tocant.
 */
export function Walkout({ c, dorsal, onDone }: { c: Convocation; dorsal: number | null; onDone: () => void }) {
  useEffect(() => {
    const t1 = setTimeout(() => haptic(), 900);
    const t2 = setTimeout(onDone, 6200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`walkout ${kitFont.variable}`} role="dialog" aria-label="Estàs convocada" onClick={onDone}>
      <i className="wo-light l" aria-hidden="true" /><i className="wo-light r" aria-hidden="true" />
      <div className="wo-body">
        <span className="wo-num" aria-hidden="true">{dorsal ?? "★"}</span>
        <b className="wo-title">ESTÀS<br />CONVOCADA</b>
        <span className="wo-vs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escut.png" alt="" width={34} height={34} />
          <i>vs</i>
          <Crest name={c.rival} size={34} />
        </span>
        <span className="wo-when">{DOW[isoDow(c.match_date)]}{c.kickoff ? ` · ${hhmm(c.kickoff)} h` : ""}{c.meet_time ? ` · quedada ${hhmm(c.meet_time)} h` : ""}</span>
        <button type="button" className="wo-go" onClick={onDone}>Som-hi! 💪</button>
      </div>
    </div>,
    document.body,
  );
}
