import { adminClient } from "@/lib/server-admin";

export const maxDuration = 30;

// A partir de l'enllaç d'un partit de Veo (públic), troba el vídeo per veure'l a l'anàlisi. Només staff.
// Només es consulten adreces de Veo (res més), i se segueixen com a molt 3 redireccions.
const VEO_HOST = /(^|\.)veo\.(co|com)$/i;
const UA = "Mozilla/5.0 (compatible; WellnessCEEuropa/1.0)";

async function resolve(link: string): Promise<URL> {
  let u = new URL(link);
  for (let i = 0; i < 3; i++) {
    if (u.protocol !== "https:" || !VEO_HOST.test(u.hostname)) throw new Error("Aquest enllaç no és de Veo.");
    if (/\/matches\/[^/]+/.test(u.pathname)) return u;
    // enllaç curt: es demana sense seguir la redirecció i es comprova on porta
    const res = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA } });
    const loc = res.headers.get("location");
    if (!loc) break;
    u = new URL(loc, u);
  }
  if (!/\/matches\/[^/]+/.test(u.pathname)) throw new Error("No trobo el partit en aquest enllaç de Veo.");
  return u;
}

type Video = { url: string; w: number; pano: boolean };

/** Busca dins la resposta de Veo totes les adreces de vídeo (MP4) que hi hagi. */
function findVideos(x: unknown, out: Video[] = [], ctx: { w: number; pano: boolean } = { w: 0, pano: false }): Video[] {
  if (Array.isArray(x)) x.forEach((v) => findVideos(v, out, ctx));
  else if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const w = Number(o.width ?? o.resolution_width ?? ctx.w) || 0;
    const pano = ctx.pano || /pano/i.test(String(o.render_type ?? o.type ?? o.name ?? ""));
    for (const v of Object.values(o)) {
      if (typeof v === "string" && /^https:\/\/[^\s]+\.mp4(\?|$)/i.test(v)) out.push({ url: v, w, pano });
      else findVideos(v, out, { w, pano });
    }
  }
  return out;
}

/** Vídeo a partir de la pàgina pública del partit (etiquetes og:). Es comprova que el vídeo existeix. */
async function videoFromPage(page: URL): Promise<{ url: string; title: string | null } | null> {
  const res = await fetch(page, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();
  const meta = (p: string) => html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]+)"`, "i"))?.[1] ?? null;
  const img = meta("og:image");
  const m = img?.match(/^(https:\/\/c\.veocdn\.com\/[0-9a-f-]+\/standard\/[a-z]+\/[0-9a-f-]+\/)thumbnail\.jpg$/i);
  if (!m) return null;
  const url = `${m[1]}video.mp4`;
  const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, cache: "no-store" });
  if (!head.ok) return null;
  const title = meta("og:title")?.replace(/^Veo \|\s*/, "") ?? null;
  return { url, title };
}

export async function GET(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff." }, { status: 403 });

  const link = new URL(req.url).searchParams.get("url") ?? "";
  if (!link || link.length > 400) return Response.json({ error: "Enganxa l'enllaç del partit de Veo." }, { status: 400 });
  try {
    const page = await resolve(link.trim());
    const slug = page.pathname.match(/\/matches\/([^/]+)/)![1];
    const api = `https://app.veo.co/api/app/matches/${encodeURIComponent(slug)}`;
    const get = (path: string) => fetch(`${api}/${path}`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    let [mRes, vRes] = await Promise.all([get(""), get("videos/")]);
    // Si Veo diu que no a la primera (pot ser un error puntual), es torna a provar un cop
    if (mRes.status >= 400 || vRes.status >= 400) {
      await new Promise((r) => setTimeout(r, 800));
      [mRes, vRes] = await Promise.all([get(""), get("videos/")]);
    }
    const match = mRes.ok ? ((await mRes.json().catch(() => ({}))) as Record<string, unknown>) : {};
    const privacy = typeof match.privacy === "string" ? match.privacy : null;
    if (privacy && privacy !== "public") {
      return Response.json({ error: "Aquest partit de Veo no és públic. A Veo, posa'l com a «Públic» (Compartir) i torna-ho a provar." }, { status: 403 });
    }
    if (mRes.status === 404 || vRes.status === 404) return Response.json({ error: "Veo no ha trobat aquest partit (o l'enllaç ha caducat)." }, { status: 404 });
    // Vídeos: de la llista de vídeos o, si no es pot llegir, de la mateixa fitxa del partit
    const videos = findVideos(vRes.ok ? await vRes.json().catch(() => []) : []);
    if (!videos.length) findVideos(match, videos);
    // Si Veo no deixa llegir la fitxa, es mira la pàgina pública del partit (la de la vista prèvia dels enllaços):
    // la imatge del partit és al costat del vídeo (…/thumbnail.jpg → …/video.mp4)
    if (!videos.length && (!mRes.ok || !vRes.ok)) {
      const fromPage = await videoFromPage(page).catch(() => null);
      if (fromPage) return Response.json({ video_url: fromPage.url, title: fromPage.title, link: page.toString() });
    }
    if (!videos.length && (!mRes.ok || !vRes.ok)) {
      console.error("veo", slug, mRes.status, vRes.status);
      const blocked = [mRes.status, vRes.status].some((x) => x === 401 || x === 403);
      return Response.json({ error: blocked
        ? `Veo no deixa que el nostre servidor llegeixi els partits (resposta ${mRes.status}/${vRes.status}), encara que siguin públics. A la web de Veo, obre el partit, toca Descarregar i, quan s'obri el vídeo, copia l'adreça (comença per https://c.veocdn.com) i enganxa-la aquí.`
        : `Veo no ens deixa llegir aquest partit ara mateix (resposta ${mRes.status}/${vRes.status}). Torna-ho a provar d'aquí a una estona.` }, { status: 502 });
    }
    // La millor: la retransmissió (no la panoràmica), i de més resolució
    const best = videos.sort((a, b) => Number(a.pano) - Number(b.pano) || b.w - a.w)[0];
    if (!best) return Response.json({ error: "Aquest partit de Veo encara no té el vídeo disponible." }, { status: 404 });
    return Response.json({
      video_url: best.url,
      title: typeof match.title === "string" ? match.title : null,
      link: page.toString(),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
