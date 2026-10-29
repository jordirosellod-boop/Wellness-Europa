// Stories personals de la jugadora (1080×1350): la del gol i la del cromo. Es dibuixen al mòbil.

import { escapulat, family, H, img, NAVY, OR, ORL, toBlob, W } from "@/lib/convo-story";
import { fmtDate } from "@/lib/wellness";

const soft = (src: string | null) => (src ? img(src).catch(() => null) : Promise.resolve(null));

function canvas() {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  return { cv, x: cv.getContext("2d")! };
}

/** Fons del club: degradat blau i una llum. */
function clubBackground(x: CanvasRenderingContext2D, lx: number, ly: number, light = "rgba(90,140,255,.45)") {
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#061847"); g.addColorStop(1, "#022e91");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const sp = x.createRadialGradient(lx, ly, 20, lx, ly, 560);
  sp.addColorStop(0, light); sp.addColorStop(1, "rgba(90,140,255,0)");
  x.fillStyle = sp; x.fillRect(0, 0, W, H);
}

/** Text que es fa petit fins que hi cap. */
function fit(x: CanvasRenderingContext2D, font: string, t: string, size: number, max: number) {
  let s = size;
  do { x.font = `${s}px ${font}`; s -= 4; } while (x.measureText(t).width > max && s > 24);
}

const GOAL_WORD = (n: number) => (n >= 3 ? "HAT-TRICK!" : n === 2 ? "DOBLET!" : "GOL!");

/** «GOL!»: la jugadora gran, quants n'ha fet i contra qui. */
export async function drawGoalStory(o: {
  name: string; goals: number; rival: string; score: string; date: string | null; dorsal: string | null; cutout: string;
}): Promise<Blob> {
  const ESC = family("--font-escapulada", "Impact, sans-serif");
  const KIT = family("--font-kit", ESC);
  await Promise.all([document.fonts.load(`100px ${ESC}`), document.fonts.load(`100px ${KIT}`)]).catch(() => {});
  const [player, crest] = await Promise.all([img(o.cutout), img("/escut.png")]);
  const { cv, x } = canvas();
  clubBackground(x, W * 0.62, H * 0.55);
  escapulat(x, false);

  // La paraula gran, a dalt i darrere la jugadora
  const word = GOAL_WORD(o.goals);
  x.save();
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  fit(x, ESC, word, 300, W - 100);
  x.fillStyle = "rgba(255,255,255,.1)"; x.fillText(word, 50, 470);
  x.lineWidth = 5; x.strokeStyle = ORL; x.strokeText(word, 50, 470);
  x.restore();

  // Dorsal petit, sota la paraula
  if (o.dorsal) {
    x.font = `150px ${KIT}`; x.textAlign = "left"; x.fillStyle = "rgba(255,255,255,.9)"; x.fillText(o.dorsal, 60, 650);
  }

  // La jugadora: alta, a la dreta, amb ombra i vora de llum
  const ph = Math.min(1060, H - 220), pw = (player.width / player.height) * ph;
  const px = Math.min(W - pw - 10, W * 0.62 - pw / 2), py = H - ph - 30;
  x.save(); x.shadowColor = "rgba(0,0,20,.55)"; x.shadowBlur = 28; x.shadowOffsetX = 16; x.shadowOffsetY = 12;
  x.drawImage(player, px, py, pw, ph); x.restore();
  x.save(); x.shadowColor = "rgba(255,255,255,.55)"; x.shadowBlur = 8; x.drawImage(player, px, py, pw, ph); x.restore();

  // Degradat de baix i textos
  const f = x.createLinearGradient(0, H - 520, 0, H);
  f.addColorStop(0, "rgba(5,18,58,0)"); f.addColorStop(1, "rgba(5,18,58,.95)");
  x.fillStyle = f; x.fillRect(0, H - 520, W, 520);

  x.drawImage(crest, 56, 48, 96, 96);
  x.textAlign = "left"; x.textBaseline = "top";
  x.fillStyle = OR; x.font = `32px ${ESC}`; x.fillText("JUVENIL C · CE EUROPA", 170, 56);
  x.fillStyle = "#fff"; x.font = `66px ${ESC}`; x.fillText(o.goals > 1 ? `${o.goals} GOLS` : "1 GOL", 170, 90);

  const [first, ...rest] = o.name.trim().toUpperCase().split(/\s+/);
  x.textBaseline = "alphabetic";
  x.fillStyle = "#fff"; fit(x, ESC, first, 124, W * 0.55); x.fillText(first, 56, H - 230);
  if (rest.length) { x.fillStyle = ORL; fit(x, ESC, rest.join(" "), 74, W * 0.55); x.fillText(rest.join(" "), 56, H - 150); }
  x.fillStyle = OR; x.beginPath(); x.roundRect(56, H - 120, 230, 52, 26); x.fill();
  x.fillStyle = NAVY; x.font = `34px ${ESC}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("GOLEJADORA", 171, H - 94);
  x.textAlign = "left"; x.fillStyle = "#fff";
  const line = `VS ${o.rival.toUpperCase()} · ${o.score}${o.date ? ` · ${fmtDate(o.date).toUpperCase()}` : ""}`;
  fit(x, ESC, line, 28, W - 112); x.fillText(line, 56, H - 40);
  return toBlob(cv);
}

const TIERS = {
  blue: { c1: "#0b2a78", c2: "#022e91", c3: "#3b5fd1", ink: "#ffffff", edge: "#9fb4f0", esc: "rgba(255,255,255,.08)" },
  silver: { c1: "#5d6a86", c2: "#a9b4cc", c3: "#eef2fb", ink: "#0b1a45", edge: "#ffffff", esc: "rgba(11,26,69,.08)" },
  gold: { c1: "#7a5a12", c2: "#c79a2e", c3: "#f6e3a8", ink: "#1d1503", edge: "#fff1c2", esc: "rgba(29,21,3,.08)" },
} as const;

/** El cromo en format story, per compartir-lo. */
export async function drawCardStory(o: {
  tier: keyof typeof TIERS; dorsal: string | null; name: string; season: string; stats: [string, string][]; photo: string | null;
}): Promise<Blob> {
  const ESC = family("--font-escapulada", "Impact, sans-serif");
  const KIT = family("--font-kit", ESC);
  await Promise.all([document.fonts.load(`100px ${ESC}`), document.fonts.load(`100px ${KIT}`)]).catch(() => {});
  const [crest, pic] = await Promise.all([img("/escut.png"), soft(o.photo ?? "/kits/home.webp")]);
  const t = TIERS[o.tier];
  const { cv, x } = canvas();
  clubBackground(x, W / 2, H * 0.45, o.tier === "gold" ? "rgba(219,179,77,.35)" : "rgba(90,140,255,.45)");
  escapulat(x, false);

  // El cromo
  const cw = 760, ch = Math.round(cw * 6.7 / 5), cx = (W - cw) / 2, cy = 120;
  const shape = () => { x.beginPath(); x.roundRect(cx, cy, cw, ch, [56, 56, 86, 86]); };
  x.save(); x.shadowColor = "rgba(0,0,20,.55)"; x.shadowBlur = 50; x.shadowOffsetY = 26; shape(); x.fillStyle = t.c2; x.fill(); x.restore();
  x.save(); shape(); x.clip();
  const bg = x.createLinearGradient(cx, cy, cx + cw * 0.6, cy + ch);
  bg.addColorStop(0, t.c1); bg.addColorStop(1, t.c2);
  x.fillStyle = bg; x.fillRect(cx, cy, cw, ch);
  const glow = x.createRadialGradient(cx + cw / 2, cy + ch * 0.3, 10, cx + cw / 2, cy + ch * 0.3, cw * 0.65);
  glow.addColorStop(0, t.c3); glow.addColorStop(1, "rgba(0,0,0,0)");
  x.globalAlpha = 0.9; x.fillStyle = glow; x.fillRect(cx, cy, cw, ch); x.globalAlpha = 1;
  escapulat(x, false, { x: cx, y: cy, w: cw }, t.esc);
  // Brillantor en diagonal
  const holo = x.createLinearGradient(cx, cy, cx + cw, cy + ch);
  holo.addColorStop(0.2, "rgba(255,255,255,0)"); holo.addColorStop(0.42, "rgba(255,255,255,.18)"); holo.addColorStop(0.5, "rgba(255,255,255,0)");
  x.fillStyle = holo; x.fillRect(cx, cy, cw, ch);

  // Dorsal i escut
  x.fillStyle = t.ink; x.textAlign = "left"; x.textBaseline = "top";
  x.font = `190px ${KIT}`; x.fillText(o.dorsal ?? "–", cx + 46, cy + 40);
  x.drawImage(crest, cx + cw - 46 - 90, cy + 46, 90, 90);
  x.textAlign = "center"; x.font = `30px ${ESC}`; x.fillText("JUV. C", cx + cw - 91, cy + 146); x.fillText(o.season, cx + cw - 91, cy + 180);

  // Foto (o la samarreta)
  if (pic) {
    const maxH = o.photo ? ch * 0.54 : ch * 0.34, maxW = cw * 0.9;
    const k = Math.min(maxH / pic.height, maxW / pic.width), pw = pic.width * k, ph = pic.height * k;
    const top = o.photo ? cy + ch * 0.6 - ph : cy + ch * 0.24;
    x.save(); x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = 24; x.shadowOffsetY = 14;
    x.drawImage(pic, cx + (cw - pw) / 2, top, pw, ph); x.restore();
  }

  // Nom
  const [first, ...rest] = o.name.trim().toUpperCase().split(/\s+/);
  x.textBaseline = "alphabetic"; x.fillStyle = t.ink;
  fit(x, ESC, first, 96, cw - 80); x.fillText(first, W / 2, cy + ch * 0.6 + 96);
  if (rest.length) { x.globalAlpha = 0.85; fit(x, ESC, rest.join(" "), 44, cw - 80); x.fillText(rest.join(" "), W / 2, cy + ch * 0.6 + 146); x.globalAlpha = 1; }
  const ly = cy + ch * 0.6 + 172;
  x.globalAlpha = 0.3; x.fillRect(cx + 40, ly, cw - 80, 2); x.globalAlpha = 1;

  // Estadístiques (3 × 2)
  o.stats.slice(0, 6).forEach(([k, v], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const sx = cx + cw / 6 + (col * cw) / 3, sy = ly + 86 + row * 86;
    x.font = `64px ${ESC}`; const vw = x.measureText(v).width;
    x.font = `30px ${ESC}`; const kw = x.measureText(k).width;
    const start = sx - (vw + 12 + kw) / 2;
    x.textAlign = "left";
    x.font = `64px ${ESC}`; x.fillText(v, start, sy);
    x.globalAlpha = 0.8; x.font = `30px ${ESC}`; x.fillText(k, start + vw + 12, sy); x.globalAlpha = 1;
  });
  x.restore();

  // Vora del cromo
  x.save(); shape(); x.lineWidth = 8; x.strokeStyle = t.edge; x.stroke(); x.restore();

  // Peu
  x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = OR; x.font = `34px ${ESC}`;
  x.fillText("CE EUROPA · JUVENIL C", W / 2, H - 52);
  return toBlob(cv);
}
