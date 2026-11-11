"use client";

import { KitNumber, PlayerGrid } from "@/components/player-grid";
import { Crest } from "@/components/crest";
import { hhmm, KITS, kitOf, type Convocation, type RosterRow } from "@/lib/convo";
import { kitFont } from "@/lib/fonts";
import { fmtDateSmart } from "@/lib/wellness";
import { isoDow } from "@/lib/dates";

export { KitNumber };

const DOW = ["", "Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"];
const MON = ["gen", "feb", "mar", "abr", "mai", "jun", "jul", "ago", "set", "oct", "nov", "des"];
/** «Avui · 14 nov», «Demà · 14 nov» o «Dissabte 14 nov». */
function dayLabel(d: string): string {
  const smart = fmtDateSmart(d);
  const num = `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`;
  return /^(Avui|Demà)$/.test(smart) ? `${smart} · ${num}` : `${DOW[isoDow(d)]} ${num}`;
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
  const kitKey = kitOf(c.kit);
  const kit = kitKey ? KITS.find((k) => k.key === kitKey)! : null;

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
        <span className={c.is_home ? "us" : ""}><span className="cm-crest"><Crest name={home} size={78} className="convo-crest" /></span><b>{home}</b></span>
        <i>vs</i>
        <span className={c.is_home ? "" : "us"}><span className="cm-crest"><Crest name={away} size={78} className="convo-crest" /></span><b>{away}</b></span>
      </div>
      <p className="convo-date">
        <span className="cd-day">{dayLabel(c.match_date)}</span>
        {c.kickoff && <span className="cd-time">{hhmm(c.kickoff)} h</span>}
        <span className={`cd-side ${c.is_home ? "home" : "away"}`}>{c.is_home ? "🏠 Local" : "🚌 Visitant"}</span>
      </p>

      {me && (
        <p className={`convo-me ${me.called ? "yes" : "no"}`}>
          {me.called ? "✓ Estàs convocada" : "No estàs convocada en aquest partit"}
        </p>
      )}

      {(c.meet_time || c.kickoff) && (
        <div className="convo-times">
          {c.meet_time && <div><small>Quedada</small><b>{hhmm(c.meet_time)}</b></div>}
          {c.meet_time && c.kickoff && <i aria-hidden="true">→</i>}
          {c.kickoff && <div><small>Partit</small><b>{hhmm(c.kickoff)}</b></div>}
        </div>
      )}
      {place && (
        <a className="convo-place" href={mapsUrl(place)} target="_blank" rel="noreferrer">
          <span className="cp-pin" aria-hidden="true">📍</span>
          <span className="cp-text"><b>{c.venue || c.address}</b>{c.venue && c.address && <small>{c.address}</small>}</span>
          <span className="cp-go">Com arribar ›</span>
        </a>
      )}
      {((c.kit && !kit) || c.notes) && (
        <dl className="convo-info">
          {c.kit && !kit && (<div className="wide i-kit"><dt>Equipació</dt><dd>{c.kit}</dd></div>)}
          {c.notes && (<div className="wide i-notes"><dt>Notes</dt><dd style={{ whiteSpace: "pre-line" }}>{c.notes}</dd></div>)}
        </dl>
      )}

      {kit && (
        <div className="convo-kit">
          <span className="convo-kit-k">Equipació</span>
          <div className="convo-kit-shirts">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={kit.img} alt={kit.label} width={150} height={168} />
              <figcaption>{kit.label}</figcaption>
            </figure>
            <figure className="gk">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kits/gk.webp" alt="Portera" width={104} height={116} />
              <figcaption>Portera</figcaption>
            </figure>
          </div>
          {c.kit && !KITS.some((k) => k.value === c.kit) && <p className="convo-kit-note">{c.kit}</p>}
        </div>
      )}

      <h3 className="convo-sub">Convocades <span>{called.length}</span></h3>
      {called.length === 0 ? (
        <p className="muted small">Encara no hi ha cap jugadora convocada.</p>
      ) : (
        <PlayerGrid rows={called} meId={meId} />
      )}

      {notCalled.length > 0 && (
        <>
          <h3 className="convo-sub muted-sub">No convocades <span>{notCalled.length}</span></h3>
          <ul className="convo-out">{notCalled.map((r) => <li key={r.player_id}>{r.display_name}</li>)}</ul>
        </>
      )}
    </article>
  );
}
