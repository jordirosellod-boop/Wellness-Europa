// Pujar un vídeo de talls al Google Drive, directament del dispositiu (el servidor només dona el permís).
// Es puja a trossos («resumable»): si falla un tros, es torna a provar.

import { supabase } from "@/lib/supabase";

async function api(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
  return j;
}

export type DriveStatus = { configured: boolean; connected: boolean };
export const driveStatus = (): Promise<DriveStatus> => api("GET", "/api/google");
export const disconnectDrive = () => api("DELETE", "/api/google");

/** Va a Google a donar permís; en tornar, s'arriba a la mateixa pantalla amb ?drive=ok. */
export async function connectDrive() {
  const back = window.location.pathname + window.location.search.replace(/([?&])drive=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const { url } = (await api("POST", "/api/google", { back })) as { url: string };
  window.location.href = url;
}

const CHUNK = 32 * 256 * 1024; // 8 MB (Google demana múltiples de 256 KB)

function put(url: string, blob: Blob, range: string, onSent: (n: number) => void): Promise<{ status: number; body: string }> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Range", range);
    x.upload.onprogress = (e) => onSent(e.loaded);
    x.onload = () => res({ status: x.status, body: x.responseText });
    x.onerror = () => rej(new Error("Sense connexió mentre es pujava al Drive."));
    x.send(blob);
  });
}

/** Puja el fitxer a la carpeta «CE Europa · Talls». Torna l'enllaç per obrir-lo al Drive. */
export async function uploadToDrive(file: File, onProgress?: (f: number) => void): Promise<string> {
  const t = (await api("POST", "/api/google/token")) as { access_token: string; folder_id: string };
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t.access_token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.type || "video/mp4",
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify({ name: file.name, parents: [t.folder_id], mimeType: file.type || "video/mp4" }),
  });
  const session = start.headers.get("Location");
  if (!start.ok || !session) throw new Error(`No s'ha pogut començar a pujar al Drive (${start.status}).`);

  let pos = 0;
  for (let tries = 0; ; ) {
    const end = Math.min(file.size, pos + CHUNK);
    const r = await put(session, file.slice(pos, end), `bytes ${pos}-${end - 1}/${file.size}`, (n) => onProgress?.((pos + n) / file.size))
      .catch((e) => ({ status: 0, body: String(e) }));
    if (r.status === 200 || r.status === 201) {
      onProgress?.(1);
      const j = JSON.parse(r.body || "{}") as { id?: string; webViewLink?: string };
      return j.webViewLink ?? `https://drive.google.com/file/d/${j.id}/view`;
    }
    if (r.status === 308) { pos = end; tries = 0; continue; }
    // Error puntual (xarxa o Google): s'espera i es torna a provar el mateix tros
    if (++tries > 4 || (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429)) {
      throw new Error(r.status ? `El Drive ha dit que no (${r.status}).` : "S'ha perdut la connexió mentre es pujava al Drive.");
    }
    await new Promise((ok) => setTimeout(ok, 1500 * tries));
  }
}
