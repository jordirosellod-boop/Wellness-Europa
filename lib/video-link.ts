// Qualsevol enllaç de vídeo per a l'anàlisi: què és i com es pot reproduir.
//  · youtube / veo: com fins ara
//  · vimeo: reproductor de Vimeo (l'app el pot controlar: temps, saltar, velocitat)
//  · direct: un fitxer de vídeo (mp4, webm, mov… o Dropbox): es reprodueix com un fitxer i es poden fer els talls
//  · drive: Google Drive (el reproductor de Drive; l'app no el pot controlar)
//  · embed: qualsevol altra web: primer es prova com a fitxer i, si no, dins la pàgina

export type LinkKind = "youtube" | "veo" | "vimeo" | "direct" | "drive" | "embed";
export type VideoLink = { kind: LinkKind; url: string; label: string };

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|ogg|mkv|m3u8)(\?|#|$)/i;

export function classifyLink(raw: string): VideoLink | null {
  const link = raw.replace(/\s+/g, "");
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  const url = u.toString();

  if (/(^|\.)veo\.(co|com)$|(^|\.)veocdn\.com$/.test(host)) return { kind: "veo", url, label: "Veo" };
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return { kind: "youtube", url, label: "YouTube" };

  if (/(^|\.)vimeo\.com$/.test(host)) {
    // vimeo.com/123456789, vimeo.com/123456789/abcdef (privat amb enllaç), player.vimeo.com/video/123456789?h=abcdef
    const m = u.pathname.match(/(?:\/video)?\/(\d{6,12})(?:\/([0-9a-f]{6,20}))?/i);
    if (m) {
      const h = m[2] ?? u.searchParams.get("h");
      return { kind: "vimeo", url: `https://player.vimeo.com/video/${m[1]}${h ? `?h=${h}` : ""}`, label: "Vimeo" };
    }
  }

  if (host === "drive.google.com" || host === "docs.google.com") {
    const id = u.pathname.match(/\/file\/d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get("id");
    if (id && /^[\w-]{10,}$/.test(id)) return { kind: "drive", url: `https://drive.google.com/file/d/${id}/preview`, label: "Google Drive" };
  }

  if (/(^|\.)dropbox\.com$/.test(host) || host === "dropboxusercontent.com" || host.endsWith(".dropboxusercontent.com")) {
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return { kind: "direct", url: u.toString(), label: "Dropbox" };
  }

  if (VIDEO_EXT.test(u.pathname)) return { kind: "direct", url, label: "Vídeo" };
  return { kind: "embed", url, label: host };
}
