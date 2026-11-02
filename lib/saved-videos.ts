// Vídeos de talls ja fets, guardats al mateix dispositiu (IndexedDB): si surts de l'app abans de desar-los,
// hi continuen quan tornes. No es pugen enlloc.
// El vídeo s'hi va escrivint a trossos mentre es fa: així no cal tenir-lo sencer a la memòria
// (un vídeo llarg sencer a la memòria fa que l'iPad recarregui la pàgina just al final).

export type SavedVideo = { id: string; match_id: string; name: string; size: number; created: number; parts?: number; blob?: Blob };
type Part = { k: string; vid: string; blob: Blob };
export type VideoChunk = { type: "write"; data: Uint8Array; position: number };

const DB = "videos-fets", STORE = "v", PARTS = "p", MAX_DAYS = 21;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }).createIndex("match", "match_id");
      if (!db.objectStoreNames.contains(PARTS)) db.createObjectStore(PARTS, { keyPath: "k" }).createIndex("vid", "vid");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => { db.close(); res(req ? req.result : (undefined as T)); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error ?? (req ? req.error : null)); };
  }));
}

const partKey = (vid: string, i: number) => `${vid}:${String(i).padStart(6, "0")}`;

/** Esborra trossos que no són de cap vídeo acabat (d'un vídeo que es va quedar a mitges). */
async function cleanOrphans() {
  const ids = new Set((await tx<SavedVideo[]>([STORE], "readonly", (t) => t.objectStore(STORE).getAll())).map((v) => v.id));
  const keys = await tx<IDBValidKey[]>([PARTS], "readonly", (t) => t.objectStore(PARTS).getAllKeys());
  const orphan = keys.map(String).filter((k) => !ids.has(k.split(":")[0]));
  if (orphan.length) await tx([PARTS], "readwrite", (t) => { for (const k of orphan) t.objectStore(PARTS).delete(k); });
}

/**
 * Comença a escriure un vídeo nou al dispositiu. `stream` rep els trossos en ordre (MP4 fragmentat);
 * `finish` el dona per acabat i el posa a la llista; `abort` esborra el que s'hagi escrit.
 */
export async function createVideoWriter(match_id: string, name: string) {
  navigator.storage?.persist?.().catch(() => {});
  await cleanOrphans().catch(() => {});
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let i = 0, size = 0;
  const stream = new WritableStream<VideoChunk>({
    async write(c) {
      // Els trossos han d'arribar en ordre (si no, el fitxer quedaria malament)
      if (c.position !== size) throw new Error("El vídeo no s'ha escrit en ordre.");
      const part: Part = { k: partKey(id, i++), vid: id, blob: new Blob([c.data as Uint8Array<ArrayBuffer>]) };
      await tx([PARTS], "readwrite", (t) => t.objectStore(PARTS).put(part));
      size += c.data.byteLength;
    },
  });
  return {
    stream,
    async finish(): Promise<SavedVideo> {
      const v: SavedVideo = { id, match_id, name, size, created: Date.now(), parts: i };
      await tx([STORE], "readwrite", (t) => t.objectStore(STORE).put(v));
      return v;
    },
    abort: () => tx([PARTS], "readwrite", (t) => {
      t.objectStore(PARTS).delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`));
    }).catch(() => {}),
  };
}

/** Els vídeos fets d'un partit, del més nou al més vell (els de fa més de 3 setmanes s'esborren sols). */
export async function listVideos(match_id: string): Promise<SavedVideo[]> {
  const all = await tx<SavedVideo[]>([STORE], "readonly", (t) => t.objectStore(STORE).index("match").getAll(match_id));
  const old = all.filter((v) => Date.now() - v.created > MAX_DAYS * 86400_000);
  for (const v of old) await deleteVideo(v.id).catch(() => {});
  return all.filter((v) => !old.includes(v)).map(({ blob, ...v }) => (blob ? { ...v, blob } : v)).sort((a, b) => b.created - a.created);
}

export const deleteVideo = (id: string) => tx([STORE, PARTS], "readwrite", (t) => {
  t.objectStore(STORE).delete(id);
  t.objectStore(PARTS).delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`));
});

/** El fitxer per desar o compartir (fet dels trossos guardats, sense carregar-lo sencer a la memòria). */
export async function asFile(v: SavedVideo): Promise<File> {
  if (v.blob) return new File([v.blob], v.name, { type: "video/mp4" });
  const parts = await tx<Part[]>([PARTS], "readonly", (t) => t.objectStore(PARTS).getAll(IDBKeyRange.bound(`${v.id}:`, `${v.id}:￿`)));
  parts.sort((a, b) => a.k.localeCompare(b.k));
  return new File(parts.map((p) => p.blob), v.name, { type: "video/mp4" });
}

/** Que la pantalla no s'apagui mentre es fa el vídeo (si el dispositiu ho permet). Retorna com alliberar-ho. */
export async function keepAwake(): Promise<() => void> {
  try {
    const lock = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen");
    return () => { lock?.release().catch(() => {}); };
  } catch {
    return () => {};
  }
}
