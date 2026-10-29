"use client";

import { useEffect, useState } from "react";
import { Shirt, useDorsals } from "@/components/shirt";
import { fetchThumbs } from "@/lib/player-photos";
import { Crest } from "@/components/crest";
import { hhmm, KITS, kitOf, type Convocation, type RosterRow } from "@/lib/convo";
import { kitFont } from "@/lib/fonts";
import { fmtDate } from "@/lib/wellness";

/** Dorsal amb la tipografia de samarreta (les fletxes ja formen part de la lletra). */
export function KitNumber({ n }: { n: number | null }) {
  return <span className="kit-number" aria-label={n == null ? "Sense dorsal" : `Dorsal ${n}`}>{n == null ? "–" : n}</span>;
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
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const dorsals = useDorsals();
  useEffect(() => {
    let alive = true;
    fetchThumbs().then((m) => alive && setThumbs(m), () => {});
    return () => { alive = false; };
  }, []);

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
        <span className={c.is_home ? "us" : ""}><Crest name={home} size={72} className="convo-crest" /><b>{home}</b></span>
        <i>vs</i>
        <span className={c.is_home ? "" : "us"}><Crest name={away} size={72} className="convo-crest" /><b>{away}</b></span>
      </div>
      <p className="convo-date"><span>{fmtDate(c.match_date)}</span>{c.kickoff && <span>{hhmm(c.kickoff)} h</span>}<span className={c.is_home ? "home" : "away"}>{c.is_home ? "Local" : "Visitant"}</span></p>

      {me && (
        <p className={`convo-me ${me.called ? "yes" : "no"}`}>
          {me.called ? "✓ Estàs convocada" : "No estàs convocada en aquest partit"}
        </p>
      )}

      <dl className="convo-info">
        {c.meet_time && (<div className="i-meet"><dt>Quedada</dt><dd>{hhmm(c.meet_time)} h</dd></div>)}
        {c.kickoff && (<div className="i-ko"><dt>Partit</dt><dd>{hhmm(c.kickoff)} h</dd></div>)}
        {c.kit && !kit && (<div className="i-kit"><dt>Equipació</dt><dd>{c.kit}</dd></div>)}
        {place && (
          <div className="wide i-place">
            <dt>Camp</dt>
            <dd><a href={mapsUrl(place)} target="_blank" rel="noreferrer">{place}</a></dd>
          </div>
        )}
        {c.notes && (<div className="wide i-notes"><dt>Notes</dt><dd style={{ whiteSpace: "pre-line" }}>{c.notes}</dd></div>)}
      </dl>

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
        <ul className="convo-grid">
          {called.map((r) => (
            <li key={r.player_id} className={`${r.player_id === meId ? "mine" : ""}${thumbs.has(r.player_id) ? " has-photo" : ""}`}>
              <div className="cv-photo">
                {thumbs.has(r.player_id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs.get(r.player_id)} alt="" loading="lazy" />
                ) : <Shirt n={null} gk={dorsals.get(r.player_id)?.gk} size={58} />}
              </div>
              <div className="cv-foot">
                <KitNumber n={r.dorsal} />
                <span className="kit-name">{r.display_name}</span>
              </div>
              {r.origin && <span className="kit-origin">{r.origin}</span>}
            </li>
          ))}
        </ul>
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
