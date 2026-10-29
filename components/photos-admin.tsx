"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Shirt, useDorsals } from "@/components/shirt";
import { cutoutFromFile } from "@/lib/cutout";
import { deletePhoto, fetchThumbs, savePhoto } from "@/lib/player-photos";
import type { Profile } from "@/lib/wellness";

type Draft = { pid: string; cutout: string; thumb: string };

/** Staff: pujar la foto de cada jugadora. Es retalla el fons al mateix navegador i es guarda només per a l'equip. */
export function PhotosAdmin({ players }: { players: Profile[] }) {
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dorsals = useDorsals();

  useEffect(() => {
    fetchThumbs().then(setThumbs, () => {});
  }, []);

  async function pick(pid: string, e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(pid); setMsg(null); setDraft(null);
    try {
      const out = await cutoutFromFile(f, setStep);
      setDraft({ pid, ...out });
    } catch (err) {
      setMsg({ ok: false, text: `No s'ha pogut retallar: ${err instanceof Error ? err.message : String(err)}` });
    } finally { setBusy(null); setStep(null); }
  }

  async function save() {
    if (!draft) return;
    setBusy(draft.pid);
    try {
      await savePhoto(draft.pid, draft.cutout, draft.thumb);
      setThumbs((m) => new Map(m).set(draft.pid, draft.thumb));
      setDraft(null);
      setMsg({ ok: true, text: "Foto desada ✓" });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally { setBusy(null); }
  }

  async function remove(p: Profile) {
    if (!window.confirm(`Treure la foto de ${p.display_name}?`)) return;
    setBusy(p.id);
    try {
      await deletePhoto(p.id);
      setThumbs((m) => { const n = new Map(m); n.delete(p.id); return n; });
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
        Queden millor si són de cintura amunt o de cos sencer, amb la samarreta del club.
      </p>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}
      {draft && (
        <div className="photo-draft">
          <div className="photo-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.cutout} alt={`Foto retallada de ${name(draft.pid)}`} />
          </div>
          <div>
            <b>{name(draft.pid)}</b>
            <p className="muted small">Així queda retallada. Si no t&apos;agrada, prova amb una altra foto.</p>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn small" disabled={!!busy} onClick={save}>Desar la foto</button>
              <button type="button" className="btn small secondary" onClick={() => setDraft(null)}>Descartar</button>
            </div>
          </div>
        </div>
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
              <span className="row" style={{ gap: 4, justifyContent: "center" }}>
                <label className={`btn small${t ? " secondary" : ""}`} aria-disabled={!!busy}>
                  {t ? "Canviar" : "📷 Pujar"}
                  <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => pick(p.id, e)} />
                </label>
                {t && <button type="button" className="btn small secondary" disabled={!!busy} onClick={() => remove(p)} aria-label={`Treure la foto de ${p.display_name}`}>🗑</button>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
