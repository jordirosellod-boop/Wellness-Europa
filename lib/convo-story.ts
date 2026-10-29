// La story de «convocada» (1080×1350), dibuixada al navegador amb la foto retallada de la jugadora.

import { hhmm, type Convocation } from "@/lib/convo";
import { fmtDate } from "@/lib/wellness";

export const W = 1080, H = 1350;
export const NAVY = "#0b1846", OR = "#dbb34d", ORL = "#f3dc9a";

export function img(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("No s'ha pogut carregar la imatge."));
    i.src = src;
  });
}

/** La V de la samarreta a dalt de tot. El filet daurat només a la convocatòria. */
export function escapulat(x: CanvasRenderingContext2D, gold: boolean, b = { x: 0, y: 0, w: W }, fill = "rgba(255,255,255,.07)") {
  const ky = (b.w * 230) / 92 / W, kx = b.w / 200;
  x.fillStyle = fill;
  x.beginPath(); x.moveTo(b.x, b.y); x.lineTo(b.x + 100 * kx, b.y + 62 * ky); x.lineTo(b.x + b.w, b.y); x.lineTo(b.x + b.w, b.y + 22 * ky);
  x.lineTo(b.x + 100 * kx, b.y + 84 * ky); x.lineTo(b.x, b.y + 22 * ky); x.closePath(); x.fill();
  if (!gold) return;
  x.strokeStyle = "rgba(219,179,77,.45)"; x.lineWidth = 3;
  x.beginPath(); x.moveTo(b.x, b.y + 30 * ky); x.lineTo(b.x + 100 * kx, b.y + 92 * ky); x.lineTo(b.x + b.w, b.y + 30 * ky); x.stroke();
}

export const toBlob = (cv: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("No s'ha pogut fer la imatge."))), "image/png"));

/** Nom de la família de lletra que Next ha posat a la variable CSS (amb les alternatives). */
export const family = (v: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;

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
  escapulat(x, true);

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

  return toBlob(cv);
}

const RESULT_TITLE = { G: "VICTÒRIA!", E: "EMPAT", P: "SEGUIM ENDAVANT" } as const;

/** La story del resultat (1080×1350): els dos escuts, el marcador gran i la data. */
export async function drawResultStory(o: {
  home: string; away: string; homeGoals: number; awayGoals: number; isHome: boolean;
  outcome: "G" | "E" | "P"; date: string | null; homeCrest: string | null; awayCrest: string | null;
  scorers?: { name: string; goals: number; avatar: string | null }[];
}): Promise<Blob> {
  const ESC = family("--font-escapulada", "Impact, sans-serif");
  await document.fonts.load(`100px ${ESC}`).catch(() => {});
  const soft = (src: string | null) => (src ? img(src).catch(() => null) : Promise.resolve(null));
  const scorers = (o.scorers ?? []).slice(0, 6);
  const [club, hc, ac, faces] = await Promise.all([img("/escut.png"), soft(o.homeCrest), soft(o.awayCrest), Promise.all(scorers.map((x) => soft(x.avatar)))]);

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;
  const win = o.outcome === "G";

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#061847"); g.addColorStop(1, "#022e91");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const sp = x.createRadialGradient(W / 2, H * 0.5, 30, W / 2, H * 0.5, 600);
  sp.addColorStop(0, win ? "rgba(219,179,77,.32)" : "rgba(90,140,255,.38)"); sp.addColorStop(1, "rgba(90,140,255,0)");
  x.fillStyle = sp; x.fillRect(0, 0, W, H);
  escapulat(x, false);

  const fit = (t: string, size: number, max: number) => { let s = size; do { x.font = `${s}px ${ESC}`; s -= 4; } while (x.measureText(t).width > max && s > 24); };

  // Capçalera
  x.drawImage(club, 56, 48, 96, 96);
  x.textBaseline = "top"; x.textAlign = "left";
  x.fillStyle = OR; x.font = `32px ${ESC}`; x.fillText("JUVENIL C · RESULTAT FINAL", 170, 56);
  x.fillStyle = "#fff"; x.font = `66px ${ESC}`; x.fillText("CE EUROPA", 170, 90);

  // Títol
  x.textAlign = "center"; x.textBaseline = "alphabetic";
  x.fillStyle = win ? ORL : "#fff"; fit(RESULT_TITLE[o.outcome], 150, W - 112);
  const up = scorers.length ? 50 : 0; // amb golejadores, tot una mica més amunt
  x.fillText(RESULT_TITLE[o.outcome], W / 2, 390 - up);

  // Els dos escuts amb el nom a sota
  const crest = (im: HTMLImageElement | null, name: string, cx: number, us: boolean) => {
    const box = 280 - up, top = 470 - up * 1.4;
    x.save(); x.shadowColor = "rgba(0,0,20,.5)"; x.shadowBlur = 30; x.shadowOffsetY = 12;
    if (im) {
      const k = Math.min(box / im.width, box / im.height), w = im.width * k, h = im.height * k;
      x.drawImage(im, cx - w / 2, top + (box - h) / 2, w, h);
    } else {
      x.fillStyle = "rgba(255,255,255,.12)"; x.beginPath(); x.arc(cx, top + box / 2, box / 2.2, 0, Math.PI * 2); x.fill();
      x.shadowColor = "transparent"; x.fillStyle = "#fff"; x.font = `110px ${ESC}`; x.textBaseline = "middle";
      x.fillText(name.split(/\s+/).filter((w) => w.length > 1).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?", cx, top + box / 2 + 6);
      x.textBaseline = "alphabetic";
    }
    x.restore();
    x.fillStyle = us ? OR : "#fff"; fit(name.toUpperCase(), 40, 400);
    x.fillText(name.toUpperCase(), cx, top + box + 70);
  };
  crest(hc, o.home, W * 0.27, o.isHome);
  crest(ac, o.away, W * 0.73, !o.isHome);

  // Marcador
  x.fillStyle = "#fff"; x.font = `260px ${ESC}`; x.textBaseline = "alphabetic";
  const sc = `${o.homeGoals}–${o.awayGoals}`;
  fit(sc, 260, W - 160);
  x.save(); x.shadowColor = "rgba(0,0,20,.45)"; x.shadowBlur = 24; x.shadowOffsetY = 10;
  x.fillText(sc, W / 2, 1140 - up * 4.1); x.restore();

  // Golejadores: «⚽ Laia ×2», amb la seva cara si en té (fins a dues files)
  if (scorers.length) {
    x.font = `40px ${ESC}`; x.textBaseline = "middle"; x.textAlign = "left";
    const chips = scorers.map((g, i) => {
      const label = `${g.name.toUpperCase()}${g.goals > 1 ? ` · ${g.goals}` : ""}`;
      return { label, face: faces[i], w: 64 + 14 + x.measureText(label).width + 30 };
    });
    const rows: (typeof chips)[] = [[]];
    let width = 0;
    for (const c of chips) {
      if (width + c.w > W - 140 && rows[rows.length - 1].length) { if (rows.length === 2) break; rows.push([]); width = 0; }
      rows[rows.length - 1].push(c); width += c.w + 18;
    }
    rows.forEach((row, ri) => {
      const total = row.reduce((a, c) => a + c.w, 0) + 18 * (row.length - 1);
      let cx = W / 2 - total / 2;
      const cy = 1062 + ri * 80;
      for (const c of row) {
        x.fillStyle = "rgba(255,255,255,.12)"; x.beginPath(); x.roundRect(cx, cy - 38, c.w, 76, 38); x.fill();
        x.save(); x.beginPath(); x.arc(cx + 38, cy, 30, 0, Math.PI * 2); x.clip();
        if (c.face) {
          const k = 60 / Math.min(c.face.width, c.face.height);
          x.fillStyle = "#2a5bd7"; x.fillRect(cx + 8, cy - 30, 60, 60);
          x.drawImage(c.face, cx + 38 - (c.face.width * k) / 2, cy - 30, c.face.width * k, c.face.height * k);
        } else {
          x.fillStyle = "#fff"; x.fillRect(cx + 8, cy - 30, 60, 60);
          x.font = `38px sans-serif`; x.textAlign = "center"; x.fillText("⚽", cx + 38, cy + 2); x.textAlign = "left";
        }
        x.restore();
        x.strokeStyle = "#fff"; x.lineWidth = 3; x.beginPath(); x.arc(cx + 38, cy, 30, 0, Math.PI * 2); x.stroke();
        x.fillStyle = "#fff"; x.font = `40px ${ESC}`; x.fillText(c.label, cx + 82, cy + 3);
        cx += c.w + 18;
      }
    });
    x.textAlign = "center";
  }

  // Peu
  x.fillStyle = OR; x.beginPath(); x.roundRect(W / 2 - 200, H - 150, 400, 56, 28); x.fill();
  x.fillStyle = NAVY; x.font = `36px ${ESC}`; x.textBaseline = "middle"; x.fillText("FORÇA EUROPA", W / 2, H - 121);
  if (o.date) { x.fillStyle = "rgba(255,255,255,.85)"; x.font = `28px ${ESC}`; x.fillText(fmtDate(o.date).toUpperCase(), W / 2, H - 52); }

  return toBlob(cv);
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
