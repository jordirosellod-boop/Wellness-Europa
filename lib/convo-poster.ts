// El cartell de la convocatòria, a l'estil dels clubs professionals (format 4:5, en alta resolució
// per poder-lo imprimir): títol gran amb la jugadora per davant, la llista per línies i la franja del partit.

import { family, H, img, OR, ORL, toBlob, W } from "@/lib/convo-story";
import { hhmm, KITS, kitOf, type Convocation } from "@/lib/convo";
import { fmtDate } from "@/lib/wellness";

export type PosterRow = { name: string; dorsal: number | null; gk: boolean; pos?: string | null; origin?: string | null };
const SCALE = 2;

const soft = (src: string | null) => (src ? img(src).catch(() => null) : Promise.resolve(null));

/** Línies del camp, de la porteria cap endavant. */
const LINES: { label: string; pos: string[] }[] = [
  { label: "PORTERES", pos: ["PO"] },
  { label: "DEFENSES", pos: ["LT", "CT"] },
  { label: "MIGCAMPISTES", pos: ["MC", "INT"] },
  { label: "DAVANTERES", pos: ["EXT", "PT"] },
];

function groups(rows: PosterRow[]): { label: string; rows: PosterRow[] }[] {
  const pos = (r: PosterRow) => (r.gk ? "PO" : r.pos ?? null);
  if (!rows.some((r) => pos(r) && pos(r) !== "PO")) {
    // Sense posicions: porteres a part i la resta juntes
    const gk = rows.filter((r) => r.gk), rest = rows.filter((r) => !r.gk);
    return [{ label: "PORTERES", rows: gk }, { label: "JUGADORES", rows: rest }].filter((g) => g.rows.length);
  }
  const out = LINES.map((l) => ({ label: l.label, rows: rows.filter((r) => l.pos.includes(pos(r) ?? "")) }));
  const none = rows.filter((r) => !LINES.some((l) => l.pos.includes(pos(r) ?? "")));
  if (none.length) out.push({ label: "ALTRES", rows: none });
  return out.filter((g) => g.rows.length);
}

/** Gra fi per al fons (com els cartells impresos). */
function grain(x: CanvasRenderingContext2D) {
  const n = document.createElement("canvas");
  n.width = n.height = 160;
  const c = n.getContext("2d")!;
  const d = c.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 14;
  }
  c.putImageData(d, 0, 0);
  return x.createPattern(n, "repeat");
}

export async function drawConvoPoster(o: {
  c: Convocation; called: PosterRow[]; hero: { cutout: string; name: string; dorsal: number | null } | null;
  homeCrest: string | null; awayCrest: string | null;
}): Promise<Blob> {
  const ESC = family("--font-escapulada", "Impact, sans-serif");
  await document.fonts.load(`100px ${ESC}`).catch(() => {});
  const [club, hc, ac, hero] = await Promise.all([img("/escut.png"), soft(o.homeCrest), soft(o.awayCrest), soft(o.hero?.cutout ?? null)]);

  const cv = document.createElement("canvas");
  cv.width = W * SCALE; cv.height = H * SCALE;
  const x = cv.getContext("2d")!;
  x.scale(SCALE, SCALE);
  x.imageSmoothingQuality = "high";
  const fit = (t: string, font: string, size: number, max: number) => { let s = size; do { x.font = `${s}px ${font}`; s -= 2; } while (x.measureText(t).width > max && s > 12); };
  const BAR = 1176; // on comença la franja del partit

  // Fons: blau fosc, una llum darrere la jugadora, l'escut gegant en marca d'aigua, gra i vinyeta
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#04103a"); g.addColorStop(0.55, "#0a2a8a"); g.addColorStop(1, "#04103a");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const sp = x.createRadialGradient(330, 760, 40, 330, 760, 620);
  sp.addColorStop(0, "rgba(110,160,255,.55)"); sp.addColorStop(1, "rgba(110,160,255,0)");
  x.fillStyle = sp; x.fillRect(0, 0, W, H);
  x.save(); x.globalAlpha = 0.06; x.drawImage(club, 420, 300, 860, 860); x.restore();
  const gr = grain(x); if (gr) { x.fillStyle = gr; x.fillRect(0, 0, W, H); }
  const vig = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
  vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,20,.55)");
  x.fillStyle = vig; x.fillRect(0, 0, W, H);

  // Franja daurada de dalt
  const band = x.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, OR); band.addColorStop(0.5, ORL); band.addColorStop(1, OR);
  x.fillStyle = band; x.fillRect(0, 0, W, 8);

  // Capçalera: competició, escut i el títol gegant
  x.textBaseline = "alphabetic"; x.textAlign = "left";
  const kicker = `JUVENIL C${o.c.competition ? ` · ${o.c.competition.toUpperCase()}` : ""}`;
  x.fillStyle = OR; fit(kicker, ESC, 30, W - 220); x.fillText(kicker, 56, 84);
  x.drawImage(club, W - 56 - 72, 34, 72, 72);
  x.fillStyle = "#fff"; fit("CONVOCATÒRIA", ESC, 200, W - 100);
  x.save(); x.shadowColor = "rgba(0,0,20,.35)"; x.shadowBlur = 20; x.fillText("CONVOCATÒRIA", 48, 272); x.restore();

  // La jugadora, per davant del títol
  const listX = 612;
  if (hero && o.hero) {
    const ph = BAR - 150, pw = (hero.width / hero.height) * ph;
    const k = Math.min(1, (listX + 20) / pw), w = pw * k, h = ph * k;
    const px = Math.max(-20, 320 - w / 2), py = BAR - h + 6;
    x.save(); x.shadowColor = "rgba(0,0,20,.6)"; x.shadowBlur = 34; x.shadowOffsetX = 14; x.shadowOffsetY = 12; x.drawImage(hero, px, py, w, h); x.restore();
    x.save(); x.shadowColor = "rgba(255,255,255,.45)"; x.shadowBlur = 6; x.drawImage(hero, px, py, w, h); x.restore();
    const fade = x.createLinearGradient(0, BAR - 230, 0, BAR);
    fade.addColorStop(0, "rgba(4,16,58,0)"); fade.addColorStop(1, "rgba(4,16,58,.95)");
    x.fillStyle = fade; x.fillRect(0, BAR - 230, W, 230);
    let nx = 56;
    if (o.hero.dorsal != null) { x.fillStyle = OR; x.font = `76px ${ESC}`; x.fillText(String(o.hero.dorsal), nx, BAR - 24); nx += x.measureText(String(o.hero.dorsal)).width + 14; }
    x.fillStyle = "#fff"; fit(o.hero.name.toUpperCase(), ESC, 52, listX - nx - 40); x.fillText(o.hero.name.toUpperCase(), nx, BAR - 28);
  }

  // La llista, per línies
  const gs = groups(o.called);
  const top = 320, bottom = BAR - 24;
  const units = o.called.length + gs.length * 1.5;
  const rowH = Math.min(44, (bottom - top) / Math.max(1, units));
  const nameSize = Math.min(32, rowH * 0.74), numSize = Math.min(40, rowH * 0.92);
  let y = top;
  for (const grp of gs) {
    y += rowH * 0.95;
    x.textAlign = "left"; x.textBaseline = "alphabetic";
    x.fillStyle = OR; x.font = `${Math.min(24, rowH * 0.58)}px ${ESC}`;
    x.fillText(grp.label, listX, y);
    const lw = x.measureText(grp.label).width;
    x.fillStyle = "rgba(219,179,77,.45)"; x.fillRect(listX + lw + 12, y - rowH * 0.2, W - 56 - listX - lw - 12, 2);
    y += rowH * 0.55;
    for (const r of grp.rows) {
      const cy = y + rowH / 2;
      x.textBaseline = "middle";
      x.textAlign = "right"; x.fillStyle = r.gk ? "#f7d417" : "#fff"; x.font = `${numSize}px ${ESC}`;
      x.fillText(r.dorsal == null ? "–" : String(r.dorsal), listX + 62, cy + 2);
      x.textAlign = "left"; x.fillStyle = "#fff";
      const tag = r.origin ? r.origin.toUpperCase() : "";
      fit(r.name.toUpperCase(), ESC, nameSize, W - 56 - listX - 84 - (tag ? 110 : 0)); x.fillText(r.name.toUpperCase(), listX + 80, cy + 1);
      if (tag) {
        const nw = x.measureText(r.name.toUpperCase()).width;
        x.fillStyle = "rgba(255,255,255,.6)"; x.font = `${Math.min(18, nameSize * 0.6)}px ${ESC}`; x.fillText(tag, listX + 80 + nw + 12, cy + 2);
      }
      y += rowH;
    }
  }

  // Franja del partit
  x.fillStyle = "#030c2e"; x.fillRect(0, BAR, W, H - BAR);
  x.fillStyle = band; x.fillRect(0, BAR, W, 4);
  const home = o.c.is_home ? "CE Europa" : o.c.rival, away = o.c.is_home ? o.c.rival : "CE Europa";
  const crest = (im: HTMLImageElement | null, cx: number) => {
    const box = 92, cy = BAR + 32;
    if (im) { const k = Math.min(box / im.width, box / im.height); x.drawImage(im, cx - (im.width * k) / 2, cy + (box - im.height * k) / 2, im.width * k, im.height * k); }
    else { x.fillStyle = "rgba(255,255,255,.14)"; x.beginPath(); x.arc(cx, cy + box / 2, box / 2.2, 0, Math.PI * 2); x.fill(); }
  };
  crest(hc, 104); crest(ac, 264);
  x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = OR; x.font = `28px ${ESC}`; x.fillText("VS", 184, BAR + 78);
  const infoX = 348, infoW = W - 56 - infoX;
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  const when = `${fmtDate(o.c.match_date).toUpperCase()}${o.c.kickoff ? ` · ${hhmm(o.c.kickoff)} H` : ""}`;
  x.fillStyle = "#fff"; fit(when, ESC, 40, infoW); x.fillText(when, infoX, BAR + 62);
  const key = kitOf(o.c.kit);
  const kit = key ? KITS.find((k) => k.key === key)?.label : o.c.kit;
  const line2 = [`${home.toUpperCase()} – ${away.toUpperCase()}`, o.c.meet_time ? `QUEDADA ${hhmm(o.c.meet_time)} H` : null].filter(Boolean).join(" · ");
  x.fillStyle = ORL; fit(line2, ESC, 26, infoW); x.fillText(line2, infoX, BAR + 102);
  const line3 = [o.c.venue ? o.c.venue.toUpperCase() : null, kit ? `EQUIPACIÓ ${kit.toUpperCase()}` : null].filter(Boolean).join(" · ");
  if (line3) { x.fillStyle = "rgba(255,255,255,.7)"; fit(line3, ESC, 22, infoW); x.fillText(line3, infoX, BAR + 138); }

  return toBlob(cv);
}
