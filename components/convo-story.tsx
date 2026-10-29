"use client";

import { useEffect, useState } from "react";
import { drawConvoStory, shareOrDownload } from "@/lib/convo-story";
import type { Convocation, RosterRow } from "@/lib/convo";
import { fetchCutout } from "@/lib/player-photos";

/** «📸 La meva story»: només si està convocada i té foto. Es fa al moment, al mòbil. */
export function ConvoStoryButton({ c, me }: { c: Convocation; me: RosterRow }) {
  const [cutout, setCutout] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCutout(me.player_id).then((x) => alive && setCutout(x), () => alive && setCutout(null));
    return () => { alive = false; };
  }, [me.player_id]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  if (!me.called || !cutout) return null;
  async function make() {
    setBusy(true); setErr(null);
    try {
      const blob = await drawConvoStory({ c, name: me.display_name, dorsal: me.dorsal, cutout: cutout! });
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const fname = `convocada-${c.match_date}.png`;
  return (
    <section className="card story-card">
      {!preview ? (
        <button type="button" className="btn block" disabled={busy} onClick={make}>{busy ? "Preparant la teva story…" : "📸 La meva story de convocada"}</button>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="story-preview" src={preview.url} alt="La teva story de convocada" />
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
