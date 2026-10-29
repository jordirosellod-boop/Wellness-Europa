"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { PlayerZoom, type Zoomed } from "@/components/player-zoom";
import { Shirt, useDorsals } from "@/components/shirt";
import type { RosterRow } from "@/lib/convo";
import { fetchCutout, fetchThumbs } from "@/lib/player-photos";
import { transition } from "@/lib/vt";

/** Dorsal amb la tipografia de samarreta (les fletxes ja formen part de la lletra). */
export function KitNumber({ n }: { n: number | null }) {
  return <span className="kit-number" aria-label={n == null ? "Sense dorsal" : `Dorsal ${n}`}>{n == null ? "–" : n}</span>;
}

export type GridRow = Pick<RosterRow, "player_id" | "display_name" | "dorsal" | "origin">;

/** Quadradets amb foto (o samarreta), dorsal i nom. Tocar-ne un amb foto: la foto creix fins a la fitxa gran (i hi torna en tancar). */
export function PlayerGrid({ rows, meId }: { rows: GridRow[]; meId?: string }) {
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const dorsals = useDorsals();
  useEffect(() => {
    let alive = true;
    fetchThumbs().then((m) => alive && setThumbs(m), () => {});
    return () => { alive = false; };
  }, []);

  const [zoom, setZoom] = useState<Zoomed | null>(null);
  const grid = useRef<HTMLUListElement>(null);
  const tileImg = (id: string) => grid.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(id)}"] .cv-photo img`) ?? null;
  async function open(r: GridRow) {
    const thumb = thumbs.get(r.player_id);
    if (!thumb) return;
    const photo = await fetchCutout(r.player_id).catch(() => null) ?? thumb;
    const img = tileImg(r.player_id);
    if (img) img.style.viewTransitionName = "pz-photo";
    transition("zoom", () => {
      if (img) img.style.viewTransitionName = "";
      flushSync(() => setZoom({ row: r, photo }));
    });
  }
  const shut = useCallback(() => {
    const img = zoom ? tileImg(zoom.row.player_id) : null;
    transition("zoom", () => {
      flushSync(() => setZoom(null));
      if (img) img.style.viewTransitionName = "pz-photo";
    }, () => { if (img) img.style.viewTransitionName = ""; });
  }, [zoom]);
  const tap = (r: GridRow) => thumbs.has(r.player_id) ? {
    role: "button", tabIndex: 0, "aria-label": `Veure ${r.display_name}`,
    onClick: (e: MouseEvent) => { e.preventDefault(); open(r); },
    onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(r); } },
  } : {};

  return (
    <>
      <ul className="convo-grid" ref={grid}>
        {rows.map((r) => (
          <li key={r.player_id} data-id={r.player_id} className={`${r.player_id === meId ? "mine" : ""}${thumbs.has(r.player_id) ? " has-photo" : ""}`} {...tap(r)}>
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
      {zoom && <PlayerZoom z={zoom} gk={dorsals.get(zoom.row.player_id)?.gk} onClose={shut} />}
    </>
  );
}
