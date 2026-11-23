// Talls fets fora de l'app (amb el mòbil, Veo, un altre programa…): es guarden al mateix dispositiu (IndexedDB),
// s'organitzen dins dels botons de la botonera, es poden retallar i se'n pot fer un vídeo. No es pugen enlloc.

export type ImportedClip = {
  id: string;
  match_id: string;
  name: string;
  blob: Blob;
  type: string;
  duration: number; // segons del fitxer
  in_s: number; // retall: on comença
  out_s: number; // retall: on acaba
  button: string | null; // etiqueta del botó (null = sense classificar)
  color: string | null;
  team: "us" | "rival";
  note: string;
  order: number;
  created: number;
};

const DB = "talls-importats", STORE = "c";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("match", "match_id");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(req ? req.result : (undefined as T)); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error ?? (req ? req.error : null)); };
  }));
}

/** Durada d'un vídeo (llegint només la capçalera). */
export function videoDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(blob);
    const done = (d: number) => { URL.revokeObjectURL(url); v.removeAttribute("src"); resolve(Number.isFinite(d) && d > 0 ? d : 0); };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      // Alguns fitxers (webm) no diuen la durada fins que es busca el final
      if (Number.isFinite(v.duration)) return done(v.duration);
      v.ontimeupdate = () => { v.ontimeupdate = null; done(v.duration); };
      v.currentTime = 1e9;
    };
    v.onerror = () => done(0);
    v.src = url;
    setTimeout(() => done(v.duration), 8000);
  });
}

export async function listClips(match_id: string): Promise<ImportedClip[]> {
  const all = await tx<ImportedClip[]>("readonly", (s) => s.index("match").getAll(match_id));
  return all.sort((a, b) => a.order - b.order || a.created - b.created);
}

export async function addClips(match_id: string, files: File[], start: number, button: { label: string; color: string } | null = null): Promise<ImportedClip[]> {
  navigator.storage?.persist?.().catch(() => {});
  const out: ImportedClip[] = [];
  for (const [i, f] of files.entries()) {
    const duration = await videoDuration(f);
    const c: ImportedClip = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      match_id, name: f.name.replace(/\.[a-z0-9]{2,4}$/i, ""), blob: f, type: f.type || "video/mp4",
      duration, in_s: 0, out_s: duration, button: button?.label ?? null, color: button?.color ?? null,
      team: "us", note: "", order: start + i, created: Date.now() + i,
    };
    await tx("readwrite", (s) => s.put(c));
    out.push(c);
  }
  return out;
}

export async function updateClip(c: ImportedClip): Promise<void> {
  await tx("readwrite", (s) => s.put(c));
}

export async function deleteClip(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export const clipFile = (c: ImportedClip) => new File([c.blob], `${c.name}.${/webm/.test(c.type) ? "webm" : /quicktime/.test(c.type) ? "mov" : "mp4"}`, { type: c.type });
