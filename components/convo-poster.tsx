"use client";

import { useEffect, useState } from "react";
import { StoryCard } from "@/components/convo-story";
import { crestFor, useCrests } from "@/components/crest";
import { useDorsals } from "@/components/shirt";
import type { Convocation, RosterRow } from "@/lib/convo";
import { drawConvoPoster } from "@/lib/convo-poster";
import { fetchCutout, fetchThumbs } from "@/lib/player-photos";

/** Staff: el cartell de la convocatòria per descarregar o enviar. Es tria quina jugadora hi surt en gran. */
export function ConvoPosterButton({ c, roster }: { c: Convocation; roster: RosterRow[] }) {
  const teams = useCrests();
  const dorsals = useDorsals();
  const [withPhoto, setWithPhoto] = useState<Set<string>>(new Set());
  const [hero, setHero] = useState<string>("");
  useEffect(() => {
    let alive = true;
    fetchThumbs().then((m) => alive && setWithPhoto(new Set(m.keys())), () => {});
    return () => { alive = false; };
  }, []);

  const called = roster.filter((r) => r.called).sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999) || a.display_name.localeCompare(b.display_name, "ca"));
  const options = called.filter((r) => withPhoto.has(r.player_id));
  const chosen = options.find((r) => r.player_id === hero) ?? options[0];
  if (!called.length) return null;

  const home = c.is_home ? "CE Europa" : c.rival, away = c.is_home ? c.rival : "CE Europa";
  return (
    <section className="card poster-card">
      <h2 style={{ marginTop: 0 }}>🖼️ Cartell de la convocatòria</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Una imatge amb el partit i totes les convocades, per enviar al grup o imprimir.</p>
      {options.length > 0 ? (
        <label className="poster-pick">
          <span>Foto del cartell</span>
          <select value={chosen?.player_id ?? ""} onChange={(e) => setHero(e.target.value)}>
            {options.map((r) => <option key={r.player_id} value={r.player_id}>{r.dorsal != null ? `${r.dorsal} · ` : ""}{r.display_name}</option>)}
          </select>
        </label>
      ) : (
        <p className="muted small">Cap convocada té foto encara: el cartell sortirà sense foto gran.</p>
      )}
      <StoryCard label="🖼️ Fer el cartell" busyLabel="Preparant el cartell…" alt="Cartell de la convocatòria" fname={`convocatoria-${c.match_date}.png`}
        make={async () => drawConvoPoster({
          c,
          called: called.map((r) => ({ name: r.display_name, dorsal: r.dorsal, gk: !r.guest && !!dorsals.get(r.player_id)?.gk, origin: r.guest ? r.origin : null })),
          hero: chosen ? { cutout: (await fetchCutout(chosen.player_id)) ?? "", name: chosen.display_name, dorsal: chosen.dorsal } : null,
          homeCrest: crestFor(teams, home), awayCrest: crestFor(teams, away),
        })} />
    </section>
  );
}
