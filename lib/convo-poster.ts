// El cartell de la convocatòria (format 4:5, en alta resolució per poder-lo imprimir): el partit,
// la llista de convocades amb el dorsal i una de les jugadores en gran. Es dibuixa al navegador.

import { family, H, img, NAVY, OR, ORL, toBlob, W } from "@/lib/convo-story";
import { hhmm, KITS, kitOf, type Convocation } from "@/lib/convo";
import { fmtDate } from "@/lib/wellness";

export type PosterRow = { name: string; dorsal: number | null; gk: boolean; origin?: string | null };
const SCALE = 2;

const soft = (src: string | null) => (src ? img(src).catch(() => null) : Promise.resolve(null));

export async function drawConvoPoster(o: {
  c: Convocation; called: PosterRow[]; hero: { cutout: string; name: string; dorsal: number | null } | null;
  homeCrest: string | null; awayCrest: string | null;
}): Promise<Blob> {
  const ESC = family("--font-escapulada", "Impact, sans-serif");
  const KIT = family("--font-kit", ESC);
  await Promise.all([document.fonts.load(`100px ${ESC}`), document.fonts.load(`100px ${KIT}`)]).catch(() => {});
  const [club, hc, ac, hero] = await Promise.all([img("/escut.png"), soft(o.homeCrest), soft(o.awayCrest), soft(o.hero?.cutout ?? null)]);

  const cv = document.createElement("canvas");
  cv.width = W * SCALE; cv.height = H * SCALE;
  const x = cv.getContext("2d")!;
  x.scale(SCALE, SCALE);
  x.imageSmoothingQuality = "high";
  const fit = (t: string, font: string, size: number, max: number) => { let s = size; do { x.font = `${s}px ${font}`; s -= 2; } while (x.measureText(t).width > max && s > 14); };

  // Fons del club, llum darrere la jugadora i l'escapulat amb el filet daurat
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#061847"); g.addColorStop(1, "#022e91");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const sp = x.createRadialGradient(300, 880, 30, 300, 880, 560);
  sp.addColorStop(0, "rgba(90,140,255,.45)"); sp.addColorStop(1, "rgba(90,140,255,0)");
  x.fillStyle = sp; x.fillRect(0, 0, W, H);
  // A dalt, la franja daurada de la convocatòria (com al full de l'app)
  const band = x.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, "rgba(219,179,77,0)"); band.addColorStop(0.25, OR); band.addColorStop(0.5, ORL); band.addColorStop(0.75, OR); band.addColorStop(1, "rgba(219,179,77,0)");
  x.fillStyle = band; x.fillRect(0, 0, W, 6);

  // Capçalera
  x.drawImage(club, 48, 40, 88, 88);
  x.textBaseline = "top"; x.textAlign = "left";
  x.fillStyle = OR; fit(`JUVENIL C${o.c.competition ? ` · ${o.c.competition.toUpperCase()}` : ""}`, ESC, 30, 860);
  x.fillText(`JUVENIL C${o.c.competition ? ` · ${o.c.competition.toUpperCase()}` : ""}`, 152, 46);
  x.fillStyle = "#fff"; x.font = `70px ${ESC}`; x.fillText("CONVOCATÒRIA", 152, 76);

  // El partit
  const home = o.c.is_home ? "CE Europa" : o.c.rival, away = o.c.is_home ? o.c.rival : "CE Europa";
  x.fillStyle = "rgba(255,255,255,.07)"; x.beginPath(); x.roundRect(40, 176, W - 80, 228, 26); x.fill();
  x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 1.5; x.stroke();
  const crest = (im: HTMLImageElement | null, name: string, cx: number, us: boolean) => {
    const box = 118, top = 194;
    x.save(); x.shadowColor = "rgba(0,0,20,.45)"; x.shadowBlur = 18; x.shadowOffsetY = 8;
    if (im) { const k = Math.min(box / im.width, box / im.height); x.drawImage(im, cx - (im.width * k) / 2, top + (box - im.height * k) / 2, im.width * k, im.height * k); }
    else { x.fillStyle = "rgba(255,255,255,.14)"; x.beginPath(); x.arc(cx, top + box / 2, box / 2.2, 0, Math.PI * 2); x.fill(); }
    x.restore();
    x.textAlign = "center"; x.textBaseline = "alphabetic"; x.fillStyle = us ? OR : "#fff";
    fit(name.toUpperCase(), ESC, 28, 250); x.fillText(name.toUpperCase(), cx, top + box + 46);
  };
  crest(hc, home, 190, o.c.is_home);
  crest(ac, away, W - 190, !o.c.is_home);
  x.textAlign = "center"; x.textBaseline = "alphabetic";
  x.fillStyle = OR; x.font = `28px ${ESC}`; x.fillText("VS", W / 2, 222);
  x.fillStyle = "#fff"; fit(fmtDate(o.c.match_date).toUpperCase(), ESC, 40, 400); x.fillText(fmtDate(o.c.match_date).toUpperCase(), W / 2, 270);
  const times = [o.c.kickoff ? `PARTIT ${hhmm(o.c.kickoff)} H` : null, o.c.meet_time ? `QUEDADA ${hhmm(o.c.meet_time)} H` : null].filter(Boolean).join(" · ");
  if (times) { x.fillStyle = ORL; fit(times, ESC, 32, 420); x.fillText(times, W / 2, 318); }
  const key = kitOf(o.c.kit);
  const kit = key ? KITS.find((k) => k.key === key)?.label : o.c.kit;
  x.fillStyle = "rgba(255,255,255,.85)";
  const sub = [o.c.is_home ? "LOCAL" : "VISITANT", kit ? `EQUIPACIÓ ${kit.toUpperCase()}` : null].filter(Boolean).join(" · ");
  fit(sub, ESC, 24, 420); x.fillText(sub, W / 2, 362);

  // La jugadora del cartell, gran a l'esquerra, amb el seu dorsal darrere
  const top = 424, bottom = 1262, listX = 596;
  if (hero && o.hero) {
    const ph = bottom - top + 10, pw = (hero.width / hero.height) * ph;
    const k = Math.min(1, (listX + 40) / pw);
    const w = pw * k, h = ph * k, px = Math.max(-10, 300 - w / 2), py = bottom - h;
    x.save(); x.shadowColor = "rgba(0,0,20,.55)"; x.shadowBlur = 26; x.shadowOffsetX = 12; x.shadowOffsetY = 10; x.drawImage(hero, px, py, w, h); x.restore();
    x.save(); x.shadowColor = "rgba(255,255,255,.5)"; x.shadowBlur = 7; x.drawImage(hero, px, py, w, h); x.restore();
    // Nom de la del cartell, a baix
    const fade = x.createLinearGradient(0, bottom - 200, 0, H - 78);
    fade.addColorStop(0, "rgba(5,18,58,0)"); fade.addColorStop(1, "rgba(5,18,58,.9)");
    x.fillStyle = fade; x.fillRect(0, bottom - 200, W, H - 78 - (bottom - 200));
    x.textAlign = "left"; x.textBaseline = "alphabetic";
    let nx = 48;
    if (o.hero.dorsal != null) { x.fillStyle = OR; x.font = `64px ${KIT}`; x.fillText(String(o.hero.dorsal), nx, bottom - 22); nx += x.measureText(String(o.hero.dorsal)).width + 14; }
    x.fillStyle = "#fff"; fit(o.hero.name.toUpperCase(), ESC, 46, listX - nx - 30); x.fillText(o.hero.name.toUpperCase(), nx, bottom - 26);
  }

  // La llista
  const n = Math.max(1, o.called.length);
  x.fillStyle = "rgba(6,24,71,.72)"; x.beginPath(); x.roundRect(listX, top, W - listX - 40, bottom - top, 24); x.fill();
  x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 1.5; x.stroke();
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.fillStyle = OR; x.font = `28px ${ESC}`; x.fillText(`CONVOCADES · ${o.called.length}`, listX + 26, top + 48);
  x.fillStyle = "rgba(219,179,77,.5)"; x.fillRect(listX + 26, top + 62, W - listX - 92, 2);
  const startY = top + 76, rowH = Math.min(42, (bottom - 20 - startY) / n);
  const nameSize = Math.min(30, rowH * 0.72), numSize = Math.min(38, rowH * 0.9);
  o.called.forEach((r, i) => {
    const y = startY + rowH * (i + 0.5);
    if (i % 2 === 0) { x.fillStyle = "rgba(255,255,255,.04)"; x.fillRect(listX + 14, y - rowH / 2, W - listX - 68, rowH); }
    x.textBaseline = "middle";
    x.textAlign = "right"; x.fillStyle = r.gk ? "#f7d417" : OR; x.font = `${numSize}px ${KIT}`; x.fillText(r.dorsal == null ? "–" : String(r.dorsal), listX + 86, y + 2);
    x.textAlign = "left"; x.fillStyle = "#fff";
    const tag = r.gk ? "POR" : r.origin ? r.origin.toUpperCase() : "";
    fit(r.name.toUpperCase(), ESC, nameSize, W - listX - 230); x.fillText(r.name.toUpperCase(), listX + 104, y + 1);
    if (tag) {
      x.font = `${Math.min(18, nameSize * 0.62)}px ${ESC}`;
      const tw = x.measureText(tag).width + 16, tx = W - 40 - 24 - tw;
      x.fillStyle = r.gk ? "#f7d417" : "rgba(255,255,255,.18)"; x.beginPath(); x.roundRect(tx, y - 12, tw, 24, 12); x.fill();
      x.fillStyle = r.gk ? "#111" : "#fff"; x.textAlign = "center"; x.fillText(tag, tx + tw / 2, y + 1);
    }
  });

  // Peu daurat amb el camp
  x.fillStyle = OR; x.fillRect(0, H - 78, W, 78);
  x.fillStyle = NAVY; x.textBaseline = "middle";
  const place = o.c.venue ? o.c.venue.toUpperCase() : "";
  x.textAlign = "right"; x.font = `34px ${ESC}`; x.fillText("FORÇA EUROPA", W - 40, H - 38);
  if (place) { x.textAlign = "left"; fit(`CAMP: ${place}`, ESC, 26, W - 420); x.fillText(`CAMP: ${place}`, 40, H - 38); }

  return toBlob(cv);
}
