// Vídeos de talls ja fets, guardats al mateix dispositiu (IndexedDB): si surts de l'app abans de desar-los,
// hi continuen quan tornes. No es pugen enlloc.

export type SavedVideo = { id: string; match_id: string; name: string; size: number; created: number; blob: Blob };

const DB = "videos-fets", STORE = "v", MAX_DAYS = 21;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("match", "match_id");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(req.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error ?? req.error); };
  }));
}

/** Guarda un vídeo fet. Demana al navegador que no l'esborri per falta d'espai (si ho permet). */
export async function saveVideo(match_id: string, file: File): Promise<SavedVideo> {
  navigator.storage?.persist?.().catch(() => {});
  const v: SavedVideo = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, match_id, name: file.name, size: file.size, created: Date.now(), blob: file };
  await tx("readwrite", (s) => s.put(v));
  return v;
}

/** Els vídeos fets d'un partit, del més nou al més vell (els de fa més de 3 setmanes s'esborren sols). */
export async function listVideos(match_id: string): Promise<SavedVideo[]> {
  const all = await tx<SavedVideo[]>("readonly", (s) => s.index("match").getAll(match_id));
  const old = all.filter((v) => Date.now() - v.created > MAX_DAYS * 86400_000);
  for (const v of old) await deleteVideo(v.id).catch(() => {});
  return all.filter((v) => !old.includes(v)).sort((a, b) => b.created - a.created);
}

export const deleteVideo = (id: string) => tx("readwrite", (s) => s.delete(id)).then(() => {});

export const asFile = (v: SavedVideo) => new File([v.blob], v.name, { type: "video/mp4" });

/** Que la pantalla no s'apagui mentre es fa el vídeo (si el dispositiu ho permet). Retorna com alliberar-ho. */
export async function keepAwake(): Promise<() => void> {
  try {
    const lock = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen");
    return () => { lock?.release().catch(() => {}); };
  } catch {
    return () => {};
  }
}
