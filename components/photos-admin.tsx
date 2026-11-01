"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { CropStep, PlaceStep, type Placement } from "@/components/photo-editor";
import { Shirt, useDorsals } from "@/components/shirt";
import { avatarFrom, cutoutFromFile, thumbFrom, type Crop } from "@/lib/cutout";
import { deletePhoto, fetchCutout, fetchPosterIds, fetchThumbs, savePhoto } from "@/lib/player-photos";
import type { Profile } from "@/lib/wellness";

// Pujar: 1) retallar el tros de la foto, 2) treure el fons, 3) col·locar-la. Les ja pujades es poden tornar a col·locar.
type Draft =
  | { kind: "crop"; pid: string; file: File; url: string }
  | { kind: "place"; pid: string; cutout: string; fresh: boolean };

/** Staff: pujar la foto de cada jugadora. Es retalla el fons al mateix navegador i es guarda només per a l'equip. */
export function PhotosAdmin({ players }: { players: Profile[] }) {
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Fotos del cartell guardades a part (no es canvien quan es puja una foto nova per a l'app)
  const [posters, setPosters] = useState<Set<string>>(new Set());
  const [alsoPoster, setAlsoPoster] = useState(false);
  const dorsals = useDorsals();

  useEffect(() => {
    fetchThumbs().then(setThumbs, () => {});
    fetchPosterIds().then(setPosters, () => {});
  }, []);

  useEffect(() => () => { if (draft?.kind === "crop") URL.revokeObjectURL(draft.url); }, [draft]);

  function pick(pid: string, e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMsg(null);
    setDraft({ kind: "crop", pid, file: f, url: URL.createObjectURL(f) });
  }

  async function cut(crop: Crop) {
    if (draft?.kind !== "crop") return;
    const { pid, file } = draft;
    setBusy(pid); setDraft(null);
    try {
      setAlsoPoster(!posters.has(pid)); // si encara no té foto del cartell, aquesta ho serà
      setDraft({ kind: "place", pid, cutout: await cutoutFromFile(file, crop, setStep), fresh: true });
    } catch (err) {
      setMsg({ ok: false, text: `No s'ha pogut retallar: ${err instanceof Error ? err.message : String(err)}` });
    } finally { setBusy(null); setStep(null); }
  }

  async function replace(pid: string) {
    setBusy(pid); setMsg(null); setDraft(null); setStep("Obrint…");
    try {
      const cutout = await fetchCutout(pid);
      if (cutout) setDraft({ kind: "place", pid, cutout, fresh: false });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally { setBusy(null); setStep(null); }
  }

  async function save(p: Placement) {
    if (draft?.kind !== "place") return;
    const { pid, cutout } = draft;
    setBusy(pid);
    try {
      const [thumb, avatar] = await Promise.all([thumbFrom(cutout, p.thumb), avatarFrom(cutout, p.avatar)]);
      const poster = draft.fresh && alsoPoster;
      await savePhoto(pid, cutout, thumb, avatar, poster);
      setThumbs((m) => new Map(m).set(pid, thumb));
      if (poster) setPosters((s) => new Set(s).add(pid));
      setDraft(null);
      setMsg({ ok: true, text: "Foto desada ✓" });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally { setBusy(null); }
  }

  async function remove(p: Profile) {
    if (!window.confirm(`Treure la foto de ${p.display_name}? (També la del cartell.)`)) return;
    setBusy(p.id);
    try {
      await deletePhoto(p.id);
      setThumbs((m) => { const n = new Map(m); n.delete(p.id); return n; });
      setPosters((s) => { const n = new Set(s); n.delete(p.id); return n; });
      setMsg({ ok: true, text: "Foto treta." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally { setBusy(null); }
  }

  const name = (pid: string) => players.find((p) => p.id === pid)?.display_name ?? "";
  return (
    <section className="card photos-admin">
      <h2>📷 Fotos de les jugadores</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Surten a la convocatòria, al seu perfil i a la story de convocada. El fons es retalla aquí mateix (la foto no surt d&apos;aquest dispositiu fins que la desis)
        i només les veu l&apos;equip. <b>Puja-les només amb el permís de la jugadora i de la família</b>, i treu-les si algú ho demana.
        Queden millor si són de cintura amunt o de cos sencer, amb la samarreta del club. Abans de desar-la la pots retallar i col·locar (a la convocatòria i a l&apos;avatar, per separat); amb ✥ la pots tornar a col·locar quan vulguis.
        El <b>cartell de la convocatòria</b> té la seva pròpia foto (🖼️): en pujar-ne una de nova pots triar si també la fa servir el cartell o no.
      </p>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}
      {draft?.kind === "crop" && <CropStep key={draft.url} src={draft.url} name={name(draft.pid)} onCancel={() => setDraft(null)} onDone={cut} />}
      {draft?.kind === "place" && draft.fresh && (
        <label className="poster-also">
          <input type="checkbox" checked={alsoPoster} onChange={(e) => setAlsoPoster(e.target.checked)} />
          <span>Fer servir aquesta foto també per al <b>cartell de la convocatòria</b>
            {posters.has(draft.pid) ? " (si no ho marques, el cartell continua amb la foto d'abans)" : ""}</span>
        </label>
      )}
      {draft?.kind === "place" && (
        <PlaceStep key={draft.pid} cutout={draft.cutout} name={name(draft.pid)} gk={dorsals.get(draft.pid)?.gk} dorsal={dorsals.get(draft.pid)?.n}
          busy={busy === draft.pid} onCancel={() => setDraft(null)} onSave={save} />
      )}
      <ul className="photo-grid">
        {players.map((p) => {
          const t = thumbs.get(p.id);
          const d = dorsals.get(p.id);
          return (
            <li key={p.id}>
              <div className="photo-tile">
                {t ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t} alt="" />
                ) : <Shirt n={null} gk={d?.gk} size={64} />}
                {busy === p.id && <span className="photo-busy">{step ?? "Desant…"}</span>}
              </div>
              <span className="photo-name">{p.display_name}</span>
              {posters.has(p.id) && <span className="photo-poster" title="Té una foto guardada per al cartell de la convocatòria">🖼️ cartell</span>}
              <span className="row" style={{ gap: 4, justifyContent: "center" }}>
                <label className={`btn small${t ? " secondary" : ""}`} aria-disabled={!!busy}>
                  {t ? <>📷<span className="sr-only"> Canviar la foto de {p.display_name}</span></> : "📷 Pujar"}
                  <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => pick(p.id, e)} />
                </label>
                {t && <button type="button" className="btn small secondary" disabled={!!busy} onClick={() => replace(p.id)} aria-label={`Col·locar la foto de ${p.display_name}`} title="Col·locar">✥</button>}
                {t && <button type="button" className="btn small secondary" disabled={!!busy} onClick={() => remove(p)} aria-label={`Treure la foto de ${p.display_name}`}>🗑</button>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
