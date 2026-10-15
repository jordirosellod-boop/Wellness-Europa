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
    const [mRes, vRes] = await Promise.all([
      fetch(`${api}/`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" }),
      fetch(`${api}/videos/`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" }),
    ]);
    if (mRes.status === 401 || mRes.status === 403 || vRes.status === 401 || vRes.status === 403) {
      return Response.json({ error: "Aquest partit de Veo no és públic. A Veo, posa'l com a «Públic» (Compartir) i torna-ho a provar." }, { status: 403 });
    }
    if (!vRes.ok) return Response.json({ error: "Veo no ha trobat aquest partit (o l'enllaç ha caducat)." }, { status: 404 });
    const match = mRes.ok ? ((await mRes.json()) as Record<string, unknown>) : {};
    const videos = findVideos(await vRes.json());
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
