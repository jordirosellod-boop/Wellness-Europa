// La story de «convocada» (1080×1350), dibuixada al navegador amb la foto retallada de la jugadora.

import { hhmm, type Convocation } from "@/lib/convo";
import { fmtDate } from "@/lib/wellness";

const W = 1080, H = 1350;
const NAVY = "#0b1846", OR = "#dbb34d", ORL = "#f3dc9a";

function img(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("No s'ha pogut carregar la imatge."));
    i.src = src;
  });
}

/** Nom de la família de lletra que Next ha posat a la variable CSS (amb les alternatives). */
const family = (v: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;

export async function drawConvoStory(o: { c: Convocation; name: string; dorsal: number | null; cutout: string }): Promise<Blob> {
  const ESC = family("--font-escapulada", "Impact, sans-serif");
  const KIT = family("--font-kit", ESC);
  await Promise.all([document.fonts.load(`100px ${ESC}`), document.fonts.load(`100px ${KIT}`)]).catch(() => {});
  const [player, crest] = await Promise.all([img(o.cutout), img("/escut.png")]);

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;

  // Fons: degradat del club
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#061847"); g.addColorStop(1, "#022e91");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // Llum darrere la jugadora
  const sp = x.createRadialGradient(W * 0.62, H * 0.52, 20, W * 0.62, H * 0.52, 520);
  sp.addColorStop(0, "rgba(90,140,255,.45)"); sp.addColorStop(1, "rgba(90,140,255,0)");
  x.fillStyle = sp; x.fillRect(0, 0, W, H);
  // Escapulat petit a dalt (la V de la samarreta) amb el filet daurat
  const ky = 230 / 92, kx = W / 200;
  x.fillStyle = "rgba(255,255,255,.07)";
  x.beginPath(); x.moveTo(0, 0); x.lineTo(100 * kx, 62 * ky); x.lineTo(W, 0); x.lineTo(W, 22 * ky); x.lineTo(100 * kx, 84 * ky); x.lineTo(0, 22 * ky); x.closePath(); x.fill();
  x.strokeStyle = "rgba(219,179,77,.45)"; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, 30 * ky); x.lineTo(100 * kx, 92 * ky); x.lineTo(W, 30 * ky); x.stroke();

  // Dorsal gran, sota l'escapulat i al costat de la jugadora
  if (o.dorsal != null) {
    x.save();
    x.font = `700px ${KIT}`; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = "rgba(255,255,255,.08)"; x.fillText(String(o.dorsal), W * 0.40, H * 0.52);
    x.lineWidth = 7; x.strokeStyle = "rgba(219,179,77,.8)"; x.strokeText(String(o.dorsal), W * 0.40, H * 0.52);
    x.restore();
  }

  // La jugadora: tan alta com hi càpiga, a la dreta, amb ombra i una vora de llum
  const ph = Math.min(1030, H - 260), pw = (player.width / player.height) * ph;
  const px = Math.min(W - pw - 10, W * 0.64 - pw / 2), py = H - ph - 40;
  x.save(); x.shadowColor = "rgba(0,0,20,.55)"; x.shadowBlur = 28; x.shadowOffsetX = 16; x.shadowOffsetY = 12;
  x.drawImage(player, px, py, pw, ph); x.restore();
  x.save(); x.shadowColor = "rgba(255,255,255,.55)"; x.shadowBlur = 8; x.drawImage(player, px, py, pw, ph); x.restore();

  // Degradat de baix per al text
  const f = x.createLinearGradient(0, H - 520, 0, H);
  f.addColorStop(0, "rgba(5,18,58,0)"); f.addColorStop(1, "rgba(5,18,58,.95)");
  x.fillStyle = f; x.fillRect(0, H - 520, W, 520);

  // Capçalera
  x.drawImage(crest, 56, 48, 96, 96);
  x.textBaseline = "top"; x.textAlign = "left";
  x.fillStyle = OR; x.font = `32px ${ESC}`;
  x.fillText(`JUVENIL C${o.c.competition ? ` · ${o.c.competition.toUpperCase()}` : ""}`.slice(0, 44), 170, 56);
  x.fillStyle = "#fff"; x.font = `66px ${ESC}`; x.fillText("CONVOCATÒRIA", 170, 90);

  // Nom (a l'esquerra, on no hi ha la jugadora)
  const [first, ...rest] = o.name.trim().toUpperCase().split(/\s+/);
  const fit = (t: string, size: number, max: number) => { let s = size; do { x.font = `${s}px ${ESC}`; s -= 4; } while (x.measureText(t).width > max && s > 30); };
  x.textBaseline = "alphabetic";
  x.fillStyle = "#fff"; fit(first, 124, W * 0.55); x.fillText(first, 56, H - 230);
  if (rest.length) { x.fillStyle = ORL; fit(rest.join(" "), 74, W * 0.55); x.fillText(rest.join(" "), 56, H - 150); }
  // «Convocada» i el partit
  x.fillStyle = OR; x.beginPath(); x.roundRect(56, H - 120, 274, 52, 26); x.fill();
  x.fillStyle = NAVY; x.font = `34px ${ESC}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("CONVOCADA", 193, H - 94);
  x.textAlign = "left"; x.fillStyle = "#fff"; x.font = `28px ${ESC}`;
  const when = `${fmtDate(o.c.match_date).toUpperCase()}${o.c.kickoff ? ` · ${hhmm(o.c.kickoff)} H` : ""} · VS ${o.c.rival.toUpperCase()}`;
  fit(when, 28, W - 112); x.fillText(when, 56, H - 40);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("No s'ha pogut fer la imatge."))), "image/png"));
}

/** Comparteix la imatge (WhatsApp, Instagram…) o, si no es pot, la baixa. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch { /* cancel·lat: la baixem */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
