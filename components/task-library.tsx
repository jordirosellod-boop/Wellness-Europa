"use client";

import { useEffect, useMemo, useState } from "react";
import { DrillView } from "@/components/drill-editor";
import { CONTENTS, TASK_TYPES, type Task } from "@/lib/plan";
import { fetchLibrary, removeFromLibrary, saveToLibrary, takeFromLibrary, type LibraryItem } from "@/lib/task-library";

/** Guardar una tasca a la biblioteca: nom i continguts (per trobar-la després). */
export function SaveToLibrary({ task, planContents, onClose }: { task: Task; planContents: string[]; onClose: () => void }) {
  const [title, setTitle] = useState(task.type || task.description.split(/[.\n]/)[0].slice(0, 60) || "Tasca");
  const [contents, setContents] = useState<string[]>(planContents.filter((c) => (CONTENTS as readonly string[]).includes(c)));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!title.trim()) return setMsg({ ok: false, text: "Posa-li un nom." });
    setBusy(true);
    try {
      await saveToLibrary(task, title, contents);
      setMsg({ ok: true, text: "Guardada a la biblioteca ⭐" });
      setTimeout(onClose, 900);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }
  return (
    <div className="lib-save">
      <label className="field" htmlFor={`lib-${task.id}`}>Nom a la biblioteca</label>
      <input id={`lib-${task.id}`} type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      <span className="muted small">Continguts (per trobar-la després):</span>
      <div className="lib-chips">
        {CONTENTS.map((c) => (
          <button key={c} type="button" aria-pressed={contents.includes(c)} onClick={() => setContents(contents.includes(c) ? contents.filter((x) => x !== c) : [...contents, c])}>{c}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn small" disabled={busy} onClick={save}>{busy ? "Guardant…" : "⭐ Guardar"}</button>
        <button type="button" className="btn small secondary" onClick={onClose}>Cancel·lar</button>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}
    </div>
  );
}

/** Triar tasques de la biblioteca per afegir-les a l'entreno. */
export function LibraryPicker({ onPick, onClose }: { onPick: (t: Task) => void; onClose: () => void }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [content, setContent] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchLibrary().then(setItems, (e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const types = useMemo(() => [...new Set([...TASK_TYPES, ...(items ?? []).map((i) => i.type)].filter(Boolean))].filter((t) => (items ?? []).some((i) => i.type === t)), [items]);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const shown = (items ?? []).filter((i) =>
    (!type || i.type === type) && (!content || i.contents.includes(content)) &&
    (!q || norm(`${i.title} ${i.type} ${i.task.description} ${i.task.objective}`).includes(norm(q))));

  async function add(i: LibraryItem) {
    onPick(await takeFromLibrary(i));
    setAdded((s) => new Set([...s, i.id]));
  }
  async function del(i: LibraryItem) {
    if (!window.confirm(`Treure «${i.title}» de la biblioteca?`)) return;
    try {
      await removeFromLibrary(i.id);
      setItems((l) => l && l.filter((x) => x.id !== i.id));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <section className="card lib-picker">
      <div className="row between">
        <h2 className="esc" style={{ margin: 0 }}>📚 Biblioteca</h2>
        <button type="button" className="btn small secondary" onClick={onClose}>Tancar</button>
      </div>
      {err && <p className="msg error">{err}</p>}
      {items && items.length === 0 && <p className="muted">Encara no hi has guardat cap tasca. A cada tasca tens el botó «⭐ Guardar a la biblioteca».</p>}
      {items && items.length > 0 && (
        <>
          <input type="search" placeholder="Busca (rondo, pressió, finalització...)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar a la biblioteca" />
          <div className="lib-chips">
            <button type="button" aria-pressed={!type} onClick={() => setType("")}>Totes</button>
            {types.map((t) => <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(type === t ? "" : t)}>{t}</button>)}
          </div>
          <div className="lib-chips small">
            {CONTENTS.filter((c) => items.some((i) => i.contents.includes(c))).map((c) => (
              <button key={c} type="button" aria-pressed={content === c} onClick={() => setContent(content === c ? "" : c)}>{c}</button>
            ))}
          </div>
          <ul className="lib-list">
            {shown.map((i) => (
              <li key={i.id}>
                <div className="lib-thumb">
                  {i.task.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.task.image} alt="" />
                  ) : <DrillView d={i.task.diagram} />}
                </div>
                <div className="lib-info">
                  <b>{i.title}</b>
                  <span className="muted small">{[i.type, i.task.total || i.task.time, i.task.space].filter(Boolean).join(" · ")}</span>
                  {i.contents.length > 0 && <span className="lib-tags">{i.contents.join(" · ")}</span>}
                  {i.uses > 0 && <span className="muted small">Feta servir {i.uses} {i.uses === 1 ? "vegada" : "vegades"}</span>}
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    <button type="button" className="btn small" onClick={() => add(i)}>{added.has(i.id) ? "✓ Afegida · una altra" : "+ Afegir"}</button>
                    <button type="button" className="btn small secondary" onClick={() => del(i)} aria-label={`Treure ${i.title} de la biblioteca`}>🗑</button>
                  </div>
                </div>
              </li>
            ))}
            {shown.length === 0 && <li className="muted">Cap tasca amb aquests filtres.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
