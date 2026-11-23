import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// A partir de l'enllaç d'una pàgina PÚBLICA amb un vídeo (qualsevol web), troba l'adreça del vídeo
// perquè l'anàlisi el pugui reproduir, controlar i tallar. Només staff.
// Només llegeix el que qualsevol visitant veu sense iniciar sessió (amb un identificador honest):
// si la web demana sessió o no publica el vídeo, no es força res.
export const UA = "Mozilla/5.0 (compatible; WellnessCEEuropa/1.0; +https://wellness-europa.vercel.app)";
export const MAX_HTML = 2_000_000;

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80")) return true;
    const v4 = x.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return v4 ? privateIp(v4) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
/** Només webs públiques d'internet (res de la xarxa interna). */
export async function safeUrl(raw: string | URL): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("L'enllaç ha de començar per https://");
  if (u.username || u.password) throw new Error("Aquest enllaç no és vàlid.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("Aquest enllaç no és vàlid.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("Aquest enllaç no és vàlid.");
  return u;
}
export async function get(u0: string, accept: string): Promise<{ res: Response; url: URL }> {
  let u = await safeUrl(u0);
  for (let i = 0; i < 4; i++) {
    const res = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA, Accept: accept }, cache: "no-store", signal: AbortSignal.timeout(9000) });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { u = await safeUrl(new URL(loc, u)); continue; }
    return { res, url: u };
  }
  throw new Error("L'enllaç redirigeix massa vegades.");
}

type Cand = { url: string; score: number };
const unesc = (s: string) => s.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/");

/** Busca a la pàgina les adreces de vídeo que la mateixa web publica (etiquetes per a xarxes, <video>, dades estructurades). */
export function candidates(html: string, base: URL): Cand[] {
  const out: Cand[] = [];
  const add = (raw: string | undefined | null, score: number) => {
    if (!raw) return;
    try {
      const u = new URL(unesc(raw.trim()), base);
      if (u.protocol !== "https:" && u.protocol !== "http:") return;
      const ext = u.pathname.match(/\.(mp4|m4v|webm|mov|m3u8)$/i)?.[1]?.toLowerCase();
      out.push({ url: u.toString(), score: score + (ext === "mp4" || ext === "m4v" ? 3 : ext === "m3u8" ? 2 : ext ? 1 : 0) });
    } catch { /* adreça no vàlida */ }
  };
  const meta = (name: string) => [...html.matchAll(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*>`, "gi"))]
    .map((m) => m[0].match(/content=["']([^"']+)["']/i)?.[1]);
  for (const n of ["og:video:secure_url", "og:video:url", "og:video"]) meta(n).forEach((v) => add(v, 10));
  meta("twitter:player:stream").forEach((v) => add(v, 9));
  meta("contentUrl").forEach((v) => add(v, 8));
  for (const m of html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi)) add(m[1], 7);
  for (const m of html.matchAll(/"contentUrl"\s*:\s*"([^"]+)"/gi)) add(m[1], 8);
  for (const m of unesc(html).matchAll(/https?:\/\/[^\s"'<>]+?\.(?:mp4|m4v|webm|mov|m3u8)(?:\?[^\s"'<>]*)?/gi)) add(m[0], 4);
  // només vídeos (no pàgines): o bé tenen extensió de vídeo, o bé són d'una etiqueta og:video
  return out.filter((c) => /\.(mp4|m4v|webm|mov|m3u8)$/i.test(new URL(c.url).pathname) || c.score >= 8).sort((x, y) => y.score - x.score);
}

/** Comprova que l'adreça és realment un vídeo que es pot veure sense sessió. */
export async function isVideo(url: string): Promise<"mp4" | "hls" | null> {
  try {
    const { res } = await get(url, "*/*");
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    void res.body?.cancel();
    if (!res.ok && res.status !== 206) return null;
    if (/mpegurl/.test(type) || /\.m3u8(\?|$)/i.test(url)) return "hls";
    if (type.startsWith("video/") || /octet-stream/.test(type) || /\.(mp4|m4v|webm|mov)(\?|$)/i.test(url)) return "mp4";
    return null;
  } catch { return null; }
}

