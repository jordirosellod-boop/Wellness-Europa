"use client";

import { useId } from "react";
import { hhmm, type Convocation, type RosterRow } from "@/lib/convo";
import { kitFont } from "@/lib/fonts";
import { fmtDate } from "@/lib/wellness";

/**
 * Dorsal d'estil samarreta (com la tipografia de hummel): número estret i gruixut amb
 * les fletxes (chevrons) dins del traç esquerre de cada xifra.
 */
export function KitNumber({ n, height = 56 }: { n: number | null; height?: number }) {
  const id = useId().replace(/:/g, "");
  const text = n == null ? "–" : String(n);
  const cw = 52;
  const w = cw * text.length + 8;
  const digits = [...text].map((d, i) => ({ d, x: 4 + i * cw + cw / 2 }));
  return (
    <svg className="kit-number" viewBox={`0 0 ${w} 100`} height={height} role="img" aria-label={`Dorsal ${text}`}>
      <defs>
        <clipPath id={`k${id}`}>
          {digits.map(({ d, x }, i) => (
            <text key={i} x={x} y={92} textAnchor="middle" fontSize={118} fontWeight={800} style={{ fontFamily: "var(--font-kit)" }}>{d}</text>
          ))}
        </clipPath>
      </defs>
      {digits.map(({ d, x }, i) => (
        <text key={i} x={x} y={92} textAnchor="middle" fontSize={118} fontWeight={800} fill="currentColor" style={{ fontFamily: "var(--font-kit)" }}>{d}</text>
      ))}
      {text !== "–" && (
        <g clipPath={`url(#k${id})`} fill="none" stroke="var(--kit-chevron, #fff)" strokeWidth={3.2} strokeLinejoin="miter">
          {digits.map(({ x }, i) =>
            [26, 38, 50, 62, 74].map((y) => <path key={`${i}-${y}`} d={`M${x - 15} ${y} l7 6 l7 -6 M${x - 15} ${y + 5} l7 6 l7 -6`} />),
          )}
        </g>
      )}
    </svg>
  );
}

function mapsUrl(q: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** La convocatòria tal com la veuen les jugadores (i el staff a la vista prèvia). */
export function ConvoSheet({ c, roster, meId }: { c: Convocation; roster: RosterRow[]; meId?: string }) {
  const called = roster.filter((r) => r.called).sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999) || a.display_name.localeCompare(b.display_name, "ca"));
  const notCalled = roster.filter((r) => !r.called);
  const me = meId ? roster.find((r) => r.player_id === meId) : undefined;
  const home = c.is_home ? "CE Europa" : c.rival;
  const away = c.is_home ? c.rival : "CE Europa";
  const place = [c.venue, c.address].filter(Boolean).join(", ");

  return (
    <article className={`convo ${kitFont.variable}`}>
      <header className="convo-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escut.png" alt="" width={56} height={56} />
        <div>
          <span className="convo-kicker">Juvenil C · {c.competition || "Partit"}</span>
          <h2 className="convo-title">Convocatòria</h2>
        </div>
      </header>

      <div className="convo-match">
        <span className={c.is_home ? "us" : ""}>{home}</span>
        <i>vs</i>
        <span className={c.is_home ? "" : "us"}>{away}</span>
      </div>
      <p className="convo-date">{fmtDate(c.match_date)}{c.kickoff ? ` · ${hhmm(c.kickoff)} h` : ""} · {c.is_home ? "Local" : "Visitant"}</p>

      {me && (
        <p className={`convo-me ${me.called ? "yes" : "no"}`}>
          {me.called ? "✓ Estàs convocada" : "No estàs convocada en aquest partit"}
        </p>
      )}

      <dl className="convo-info">
        {c.meet_time && (<div><dt>Quedada</dt><dd>{hhmm(c.meet_time)} h</dd></div>)}
        {c.kickoff && (<div><dt>Partit</dt><dd>{hhmm(c.kickoff)} h</dd></div>)}
        {c.kit && (<div><dt>Equipació</dt><dd>{c.kit}</dd></div>)}
        {place && (
          <div className="wide">
            <dt>Camp</dt>
            <dd><a href={mapsUrl(place)} target="_blank" rel="noreferrer">{place}</a></dd>
          </div>
        )}
        {c.notes && (<div className="wide"><dt>Notes</dt><dd style={{ whiteSpace: "pre-line" }}>{c.notes}</dd></div>)}
      </dl>

      <h3 className="convo-sub">Convocades <span>{called.length}</span></h3>
      {called.length === 0 ? (
        <p className="muted small">Encara no hi ha cap jugadora convocada.</p>
      ) : (
        <ul className="convo-grid">
          {called.map((r) => (
            <li key={r.player_id} className={r.player_id === meId ? "mine" : ""}>
              <KitNumber n={r.dorsal} />
              <span className="kit-name">{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}

      {notCalled.length > 0 && (
        <>
          <h3 className="convo-sub muted-sub">No convocades <span>{notCalled.length}</span></h3>
          <p className="convo-out">{notCalled.map((r) => r.display_name).join(" · ")}</p>
        </>
      )}
    </article>
  );
}
