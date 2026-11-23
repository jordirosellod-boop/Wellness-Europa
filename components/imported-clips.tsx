"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { fmtClock, teamLabels, type AButton, type AMatch } from "@/lib/analysis";
import { exportClips, ExportError, type Section } from "@/lib/clip-export";
import { addClips, clipFile, deleteClip, listClips, updateClip, type ImportedClip } from "@/lib/imported-clips";
import { announceVideo, createVideoWriter, keepAwake } from "@/lib/saved-videos";
import { canShareFile, deliverFile, safeName } from "@/lib/share-file";
import { deleteWithUndo } from "@/lib/undo";
import { fmtDate } from "@/lib/wellness";

const OTHERS = "__sense__";
const len = (c: ImportedClip) => Math.max(0, c.out_s - c.in_s);

/**
 * Talls fets fora de l'app: es pugen del dispositiu, s'organitzen dins dels botons de la botonera
 * (com si s'haguessin marcat aquí), es retallen i se'n fa un vídeo. Tot queda al dispositiu.
 */
export function ImportedClips({ match, buttons }: { match: AMatch; buttons: AButton[] }) {
  const L = teamLabels(match);
  const [clips, setClips] = useState<ImportedClip[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [edit, setEdit] = useState<ImportedClip | null>(null);
  const [into, setInto] = useState<string>(""); // botó on van els talls que s'afegeixen
  const [job, setJob] = useState<{ progress: number; ctrl: AbortController } | null>(null);
  const [cards, setCards] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    listClips(match.id).then((l) => alive && setClips(l), () => alive && setClips([]));
    return () => { alive = false; };
  }, [match.id]);

  const colorOf = (label: string | null) => buttons.find((b) => b.label === label)?.color ?? "#5a6690";
  // Grups en l'ordre de la botonera; els sense classificar, primer
  const groups = useMemo(() => {
    const list = clips ?? [];
    const keys = [OTHERS, ...buttons.map((b) => b.label), ...[...new Set(list.map((c) => c.button).filter((x): x is string => !!x))].filter((k) => !buttons.some((b) => b.label === k))];
    return keys.map((k) => ({ key: k, label: k === OTHERS ? "Sense classificar" : k, color: k === OTHERS ? "#8a93ad" : colorOf(k), clips: list.filter((c) => (c.button ?? OTHERS) === k) })).filter((g) => g.clips.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, buttons]);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
    e.target.value = "";
    if (!files.length) return;
    setBusy(true); setMsg(null);
    try {
      const b = buttons.find((x) => x.label === into) ?? null;
      const added = await addClips(match.id, files, (clips?.length ?? 0), b ? { label: b.label, color: b.color } : null);
      setClips((l) => [...(l ?? []), ...added]);
      setMsg({ ok: true, text: `${added.length} ${added.length === 1 ? "tall afegit" : "talls afegits"} ✓${b ? ` a «${b.label}»` : ". Ara posa'ls al seu botó."}` });
    } catch (err) {
      setMsg({ ok: false, text: `No s'han pogut guardar: ${err instanceof Error ? err.message : String(err)}. Potser el dispositiu no té prou espai.` });
    } finally { setBusy(false); }
  }

  async function save(c: ImportedClip) {
    await updateClip(c);
    setClips((l) => (l ?? []).map((x) => (x.id === c.id ? c : x)));
  }
  async function assign(c: ImportedClip, label: string) {
    const b = buttons.find((x) => x.label === label);
    await save({ ...c, button: label === OTHERS ? null : label, color: b?.color ?? null, order: Math.max(0, ...(clips ?? []).map((x) => x.order)) + 1 });
  }
  async function move(c: ImportedClip, dir: -1 | 1) {
    const g = groups.find((x) => x.clips.some((y) => y.id === c.id));
    if (!g) return;
    const i = g.clips.findIndex((y) => y.id === c.id), j = i + dir;
    if (j < 0 || j >= g.clips.length) return;
    const other = g.clips[j];
    const a = { ...c, order: other.order }, b = { ...other, order: c.order };
    if (a.order === b.order) { a.order = other.order + dir * 0.5; }
    await updateClip(a); await updateClip(b);
    setClips((l) => (l ?? []).map((x) => (x.id === a.id ? a : x.id === b.id ? b : x)).sort((p, q) => p.order - q.order || p.created - q.created));
  }
  function remove(c: ImportedClip) {
    deleteWithUndo(`Tall esborrat (${c.name})`, {
      hide: () => setClips((l) => (l ?? []).filter((x) => x.id !== c.id)),
      restore: () => setClips((l) => ((l ?? []).some((x) => x.id === c.id) ? l : [...(l ?? []), c].sort((p, q) => p.order - q.order))),
      commit: () => { void deleteClip(c.id); },
    });
  }

  async function makeVideo() {
    if (!clips?.length || job) return;
    const secs: Section[] = groups.map((g) => ({
      title: g.label, sub: `${g.clips.length} ${g.clips.length === 1 ? "tall" : "talls"}`, color: g.color,
      clips: g.clips.filter((c) => len(c) > 0.2).map((c) => ({ start: c.in_s, end: c.out_s, label: g.key === OTHERS ? c.name : g.label, sub: c.note || undefined, color: g.color, team: c.team, src: clipFile(c) })),
    })).filter((s) => s.clips.length);
    if (!secs.length) return;
    setMsg(null);
    const ctrl = new AbortController();
    setJob({ progress: 0, ctrl });
    const release = await keepAwake();
    const name = `${safeName(`Talls - ${match.title} - ${match.match_date}`)}.mp4`;
    const writer = await createVideoWriter(match.id, name).catch(() => null);
    const font = root.current ? getComputedStyle(root.current).getPropertyValue("--font-escapulada").trim() || "sans-serif" : "sans-serif";
    try {
      const first = secs[0].clips[0].src!;
      const blob = await exportClips(first, secs, {
        intro: { title: match.title, sub: `${fmtDate(match.match_date)} · ${secs.reduce((n, s) => n + s.clips.length, 0)} talls` },
        cards, overlay, drawings: false, font, signal: ctrl.signal,
        onProgress: (p) => setJob((j) => (j && j.ctrl === ctrl ? { ...j, progress: p } : j)),
        out: writer?.stream,
      });
      let f: File;
      if (writer) { const v = await writer.finish(); announceVideo(v.id); f = new File([], name); }
      else f = new File([blob!], name, { type: "video/mp4" });
      if (!writer && !canShareFile(f)) await deliverFile(f);
      setMsg({ ok: true, text: writer ? "Vídeo fet ✓ El tens a «Vídeos fets», a sota, per compartir-lo o desar-lo." : `Vídeo fet ✓ ${f.name}` });
    } catch (e) {
      writer?.abort();
      if (e instanceof DOMException && e.name === "AbortError") setMsg({ ok: true, text: "Cancel·lat." });
      else setMsg({ ok: false, text: e instanceof ExportError ? e.message : `No s'ha pogut fer el vídeo: ${e instanceof Error ? e.message : String(e)}` });
    } finally { release(); setJob(null); }
  }

  const total = (clips ?? []).reduce((n, c) => n + len(c), 0);
  return (
    <section className="card imp-clips" ref={root}>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <h3 className="esc" style={{ margin: 0 }}>📥 Talls fets fora</h3>
        {clips && clips.length > 0 && <span className="muted small">{clips.length} talls · {fmtClock(total)}</span>}
      </div>
      <p className="muted small" style={{ margin: "4px 0 10px" }}>Puja talls que ja tens fets (del mòbil, de Veo, d&apos;un altre programa…), posa&apos;ls al seu botó, retalla&apos;ls i fes-ne un vídeo. Es queden en aquest dispositiu.</p>
      <div className="row imp-add">
        <select aria-label="On van els talls nous" value={into} onChange={(e) => setInto(e.target.value)}>
          <option value="">Sense classificar</option>
          {buttons.map((b) => <option key={b.id} value={b.label}>{b.label}</option>)}
        </select>
        <label className={`btn small${busy ? " disabled" : ""}`}>
          {busy ? "Guardant…" : "＋ Afegir talls"}
          <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple hidden disabled={busy} onChange={onFiles} />
        </label>
      </div>

      {clips === null ? <p className="muted small">Carregant…</p> : clips.length === 0 ? null : (
        <div className="imp-groups">
          {groups.map((g) => (
            <div key={g.key} className="imp-group" style={{ "--c": g.color } as CSSProperties}>
              <div className="imp-group-h"><b className="esc">{g.label}</b><span className="muted small">{g.clips.length} · {fmtClock(g.clips.reduce((n, c) => n + len(c), 0))}</span></div>
              <ul>
                {g.clips.map((c, i) => (
                  <li key={c.id}>
                    <button type="button" className="imp-name" onClick={() => setEdit(c)} title="Veure i retallar">
                      <span>▶</span><b>{c.name}</b>
                      <small>{fmtClock(len(c))}{len(c) < c.duration - 0.1 ? ` de ${fmtClock(c.duration)}` : ""}{c.team === "rival" ? ` · ${L.rival}` : ""}{c.note ? ` · ${c.note}` : ""}</small>
                    </button>
                    <select aria-label={`Botó de ${c.name}`} value={c.button ?? OTHERS} onChange={(e) => void assign(c, e.target.value)}>
                      <option value={OTHERS}>Sense classificar</option>
                      {buttons.map((b) => <option key={b.id} value={b.label}>{b.label}</option>)}
                      {c.button && !buttons.some((b) => b.label === c.button) && <option value={c.button}>{c.button}</option>}
                    </select>
                    <span className="imp-act">
                      <button type="button" disabled={i === 0} onClick={() => void move(c, -1)} aria-label="Pujar">↑</button>
                      <button type="button" disabled={i === g.clips.length - 1} onClick={() => void move(c, 1)} aria-label="Baixar">↓</button>
                      <button type="button" onClick={() => setEdit(c)} aria-label="Retallar">✂</button>
                      <button type="button" onClick={() => remove(c)} aria-label="Esborrar">✕</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {clips && clips.length > 0 && (
        <div className="imp-export">
          <label className="check"><input type="checkbox" checked={cards} onChange={(e) => setCards(e.target.checked)} /> Títol de cada botó</label>
          <label className="check"><input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Nom a sobre del vídeo</label>
          {job ? (
            <div className="imp-job">
              <div className="bar"><i style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
              <span className="small">Fent el vídeo… {Math.round(job.progress * 100)}%</span>
              <button type="button" className="btn small secondary" onClick={() => job.ctrl.abort()}>Cancel·lar</button>
            </div>
          ) : (
            <button type="button" className="btn block" onClick={() => void makeVideo()}>🎬 Fer el vídeo amb aquests talls (per botons)</button>
          )}
        </div>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}

      {edit && <ClipEditor clip={edit} buttons={buttons} labels={L} onClose={() => setEdit(null)} onSave={async (c) => { await save(c); setEdit(null); setMsg({ ok: true, text: `Desat ✓ ${c.name} · ${fmtClock(len(c))}` }); }} />}
    </section>
  );
}

/** Veure un tall, retallar-lo (inici i final), canviar-li el botó, l'equip, el nom i una nota. */
function ClipEditor({ clip, buttons, labels, onClose, onSave }: {
  clip: ImportedClip; buttons: AButton[]; labels: { us: string; rival: string }; onClose: () => void; onSave: (c: ImportedClip) => void | Promise<void>;
}) {
  const [c, setC] = useState(clip);
  const [url] = useState(() => URL.createObjectURL(clip.blob));
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(clip.duration);
  const v = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(null);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const D = dur || c.duration || 0;
  const set = (p: Partial<ImportedClip>) => setC((x) => {
    const n = { ...x, ...p };
    n.in_s = Math.max(0, Math.min(n.in_s, D)); n.out_s = Math.max(n.in_s + 0.2, Math.min(n.out_s || D, D));
    return n;
  });
  const seek = (s: number) => { if (v.current) v.current.currentTime = Math.max(0, Math.min(s, D)); };
  function playCut() {
    if (!v.current) return;
    stopAt.current = c.out_s;
    v.current.currentTime = c.in_s;
    void v.current.play();
  }
  const pick = (label: string) => { const b = buttons.find((x) => x.label === label); set({ button: label || null, color: b?.color ?? null }); };

  return (
    <div className="imp-modal" role="dialog" aria-label={`Retallar ${clip.name}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="imp-sheet">
        <div className="row between"><b className="esc">✂ Retallar el tall</b><button type="button" className="btn small secondary" onClick={onClose}>Tancar</button></div>
        <video ref={v} src={url} controls playsInline preload="metadata" className="imp-video"
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) { setDur(d); if (!clip.duration) setC((x) => ({ ...x, duration: d, out_s: x.out_s || d })); } }}
          onTimeUpdate={(e) => { const x = e.currentTarget.currentTime; setT(x); if (stopAt.current != null && x >= stopAt.current) { e.currentTarget.pause(); stopAt.current = null; } }} />

        <div className="imp-trim" style={{ "--a": `${D ? (c.in_s / D) * 100 : 0}%`, "--b": `${D ? (c.out_s / D) * 100 : 100}%`, "--t": `${D ? (t / D) * 100 : 0}%` } as CSSProperties}>
          <div className="imp-rail"><i className="sel" /><i className="now" /></div>
          <input type="range" min={0} max={D || 1} step={0.05} value={c.in_s} aria-label="Inici del tall" onChange={(e) => { set({ in_s: Number(e.target.value) }); seek(Number(e.target.value)); }} />
          <input type="range" min={0} max={D || 1} step={0.05} value={c.out_s} aria-label="Final del tall" onChange={(e) => { set({ out_s: Number(e.target.value) }); seek(Number(e.target.value)); }} />
        </div>
        <div className="imp-times">
          <span>Inici <b>{fmtClock(c.in_s)}</b></span>
          <span className="muted">Dura <b>{fmtClock(c.out_s - c.in_s)}</b></span>
          <span>Final <b>{fmtClock(c.out_s)}</b></span>
        </div>
        <div className="imp-btns">
          <button type="button" className="btn small secondary" onClick={() => set({ in_s: c.in_s - 0.5 })}>−0,5</button>
          <button type="button" className="btn small" onClick={() => set({ in_s: t })}>[ Inici aquí</button>
          <button type="button" className="btn small secondary" onClick={() => set({ in_s: c.in_s + 0.5 })}>+0,5</button>
          <button type="button" className="btn small main" onClick={playCut}>▶ Veure el tall</button>
          <button type="button" className="btn small secondary" onClick={() => set({ out_s: c.out_s - 0.5 })}>−0,5</button>
          <button type="button" className="btn small" onClick={() => set({ out_s: t })}>Final aquí ]</button>
          <button type="button" className="btn small secondary" onClick={() => set({ out_s: c.out_s + 0.5 })}>+0,5</button>
          <button type="button" className="an-small-link" onClick={() => set({ in_s: 0, out_s: D })}>Tot el vídeo</button>
        </div>

        <label className="field" htmlFor="imp-name">Nom</label>
        <input id="imp-name" type="text" maxLength={80} value={c.name} onChange={(e) => setC((x) => ({ ...x, name: e.target.value }))} />
        <label className="field" htmlFor="imp-note">Nota (surt a sota del nom al vídeo)</label>
        <input id="imp-note" type="text" maxLength={80} value={c.note} placeholder="p. ex. bona pressió tras pèrdua" onChange={(e) => setC((x) => ({ ...x, note: e.target.value }))} />
        <div className="seg-toggle" role="group" aria-label="Equip" style={{ margin: "10px 0" }}>
          <button type="button" aria-pressed={c.team === "us"} onClick={() => setC((x) => ({ ...x, team: "us" }))}>{labels.us}</button>
          <button type="button" aria-pressed={c.team === "rival"} onClick={() => setC((x) => ({ ...x, team: "rival" }))}>{labels.rival}</button>
        </div>
        <p className="muted small" style={{ margin: "0 0 6px" }}>Botó de la botonera on va:</p>
        <div className="tag-grid imp-pick">
          <button type="button" className={`tag-btn esc${!c.button ? " on" : ""}`} style={{ "--c": "#8a93ad" } as CSSProperties} onClick={() => pick("")}>Sense classificar</button>
          {buttons.map((b) => (
            <button key={b.id} type="button" className={`tag-btn esc${c.button === b.label ? " on" : ""}`} style={{ "--c": b.color } as CSSProperties} onClick={() => pick(b.label)}>{b.label}</button>
          ))}
        </div>
        <button type="button" className="btn block" style={{ marginTop: 12 }} onClick={() => void onSave({ ...c, name: c.name.trim() || clip.name })}>Desar</button>
      </div>
    </div>
  );
}
