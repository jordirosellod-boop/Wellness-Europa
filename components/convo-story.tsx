"use client";

import { useEffect, useState } from "react";
import { crestFor, useCrests } from "@/components/crest";
import { prettyTeam } from "@/lib/analysis";
import { drawConvoStory, drawResultStory, shareOrDownload } from "@/lib/convo-story";
import type { Convocation, RosterRow } from "@/lib/convo";
import { outcome, type FcfResult } from "@/lib/matchday";
import { fetchCutout } from "@/lib/player-photos";

/** Botó que fa la story al moment (al mòbil), l'ensenya i la deixa compartir o baixar. */
function StoryCard({ label, busyLabel, alt, fname, make }: { label: string; busyLabel: string; alt: string; fname: string; make: () => Promise<Blob> }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const blob = await make();
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return (
    <section className="card story-card">
      {!preview ? (
        <button type="button" className="btn block" disabled={busy} onClick={run}>{busy ? busyLabel : label}</button>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="story-preview" src={preview.url} alt={alt} />
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => shareOrDownload(preview.blob, fname)}>Compartir o baixar</button>
            <button type="button" className="btn secondary" onClick={() => setPreview(null)}>Tancar</button>
          </div>
        </>
      )}
      {err && <p className="msg error">{err}</p>}
    </section>
  );
}

/** «📸 La meva story»: només si està convocada i té foto. */
export function ConvoStoryButton({ c, me }: { c: Convocation; me: RosterRow }) {
  const [cutout, setCutout] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchCutout(me.player_id).then((x) => alive && setCutout(x), () => alive && setCutout(null));
    return () => { alive = false; };
  }, [me.player_id]);

  if (!me.called || !cutout) return null;
  return (
    <StoryCard label="📸 La meva story de convocada" busyLabel="Preparant la teva story…" alt="La teva story de convocada"
      fname={`convocada-${c.match_date}.png`}
      make={() => drawConvoStory({ c, name: me.display_name, dorsal: me.dorsal, cutout })} />
  );
}

/** «📸 Story del resultat»: els dos escuts i el marcador, per compartir en acabar el partit. */
export function ResultStoryButton({ r }: { r: FcfResult }) {
  const teams = useCrests();
  const home = prettyTeam(r.home), away = prettyTeam(r.away);
  return (
    <StoryCard label="📸 Story del resultat" busyLabel="Preparant la story…" alt={`Story del resultat: ${home} ${r.home_goals} – ${away} ${r.away_goals}`}
      fname={`resultat-${r.kickoff?.slice(0, 10) ?? r.acta_id}.png`}
      make={() => drawResultStory({
        home, away, homeGoals: r.home_goals, awayGoals: r.away_goals, isHome: r.is_home, outcome: outcome(r),
        date: r.kickoff?.slice(0, 10) ?? null, homeCrest: crestFor(teams, home), awayCrest: crestFor(teams, away),
      })} />
  );
}
