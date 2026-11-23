import { adminClient } from "@/lib/server-admin";
import { MAX_HTML, candidates, get, isVideo } from "@/lib/video-resolve";

export const maxDuration = 20;

export async function GET(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff." }, { status: 403 });

  const link = (new URL(req.url).searchParams.get("url") ?? "").trim();
  if (!link || link.length > 1000) return Response.json({ error: "Enganxa l'enllaç del vídeo." }, { status: 400 });
  try {
    // Google Drive públic: el fitxer es pot llegir directament
    const drive = link.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/)?.[1];
    if (drive) {
      const url = `https://drive.usercontent.google.com/download?id=${drive}&export=download&confirm=t`;
      const kind = await isVideo(url);
      if (kind) return Response.json({ video_url: url, type: kind, title: null });
      return Response.json({ error: "Aquest vídeo de Google Drive no és públic. A Drive: Compartir → «Qualsevol persona amb l'enllaç»." }, { status: 403 });
    }
    const { res, url: page } = await get(link, "text/html,application/xhtml+xml,video/*;q=0.9,*/*;q=0.8");
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type.startsWith("video/") || /mpegurl/.test(type)) { void res.body?.cancel(); return Response.json({ video_url: page.toString(), type: /mpegurl/.test(type) ? "hls" : "mp4", title: null }); }
    if (res.status === 401 || res.status === 403) return Response.json({ error: "Aquesta web només ensenya el vídeo amb sessió iniciada. Fes servir «🖥 Capturar»." }, { status: 403 });
    if (!res.ok) return Response.json({ error: `La web ha respost amb un error (${res.status}).` }, { status: 502 });
    const reader = res.body?.getReader();
    let html = "", size = 0;
    const dec = new TextDecoder();
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength; html += dec.decode(value, { stream: true });
      if (size > MAX_HTML) { void reader.cancel(); break; }
    }
    const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? null;
    const seen = new Set<string>();
    for (const c of candidates(html, page)) {
      if (seen.has(c.url) || seen.size >= 6) continue;
      seen.add(c.url);
      const kind = await isVideo(c.url);
      if (kind) return Response.json({ video_url: c.url, type: kind, title: title?.trim() ?? null });
    }
    return Response.json({ error: "No he trobat el vídeo dins d'aquesta pàgina sense iniciar sessió." }, { status: 404 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
