// La llista de reunions com a imatge per compartir (1080 d'ample; l'alçada depèn de quantes n'hi ha).

import { escapulat, family, img, toBlob } from "@/lib/convo-story";
import { isoDow, startOfWeek } from "@/lib/dates";
import { DOW_NAMES, endOf, hm } from "@/lib/meetings";

const W = 1080, PAD = 80;
const MONTHS = ["GEN", "FEB", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DES"];

export type ImgRow = { day: string; start_time: string; name: string; dorsal: number | null };
export type ImgDay = { day: string; label: string; rows: ImgRow[] };

function rr(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

export async function drawMeetingsImage(o: { title: string; minutes: number; season: string; days: ImgDay[] }): Promise<Blob> {
  const ESC = family("--font-escapulada", "Impact, sans-serif");
  const BODY = getComputedStyle(document.body).fontFamily || "Helvetica, Arial, sans-serif";
  await document.fonts.load(`100px ${ESC}`).catch(() => {});
  const crest = await img("/escut.png");

  // Alçada: capçalera + per cada setmana un separador + per cada dia la capçalera i les files
  const weeks = [...new Set(o.days.map((d) => startOfWeek(d.day)))];
  const ROW = 96, HEAD = 120, GAP = 18, WK = 90;
  const total = o.days.reduce((n, d) => n + d.rows.length, 0);
  const H = 470 + weeks.length * WK + o.days.reduce((n, d) => n + HEAD + d.rows.length * ROW + GAP, 0) + 120;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;

  // Fons
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#071a52"); g.addColorStop(1, "#030a24");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const sp = x.createRadialGradient(W * 0.8, 0, 20, W * 0.8, 0, 700);
  sp.addColorStop(0, "rgba(40,90,220,.55)"); sp.addColorStop(1, "rgba(40,90,220,0)");
  x.fillStyle = sp; x.fillRect(0, 0, W, 900);
  escapulat(x, false, { x: 0, y: 0, w: W }, "rgba(255,255,255,.04)");
  const bar = x.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, "#dbb34d"); bar.addColorStop(0.5, "#f6d77a"); bar.addColorStop(1, "#dbb34d");
  x.fillStyle = bar; x.fillRect(0, 0, W, 12);

  // Capçalera
  x.save(); x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 30; x.shadowOffsetY = 14;
  x.drawImage(crest, PAD, 92, 170, 170); x.restore();
  const tx = PAD + 206;
  x.textBaseline = "alphabetic";
  x.fillStyle = "#dbb34d"; x.font = `30px ${ESC}`; x.letterSpacing = "6px";
  x.fillText(`JUVENIL C · ${o.season}`, tx, 118);
  x.letterSpacing = "0px";
  const words = o.title.toUpperCase().split(/\s+/);
  const half = Math.ceil(words.length / 2);
  const l1 = words.slice(0, half).join(" "), l2 = words.slice(half).join(" ");
  for (const [t, y, c] of [[l1, 214, "#fff"], [l2, 314, "#f6d77a"]] as const) {
    if (!t) continue;
    let s = 104; do { x.font = `${s}px ${ESC}`; s -= 4; } while (x.measureText(t).width > W - tx - PAD && s > 40);
    x.fillStyle = c; x.fillText(t, tx, y);
  }
  x.fillStyle = "#d8e1ff";
  const sub = "Una estona per parlar amb cada jugadora, cara a cara.";
  let fs = 28; do { x.font = `${fs}px ${BODY}`; fs -= 1; } while (x.measureText(sub).width > W - tx - PAD && fs > 18);
  x.fillText(sub, tx, 362);

  // Xips
  const first = o.days[0]?.day, last = o.days[o.days.length - 1]?.day;
  const dm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  const chips = [`⏱ ${o.minutes} MIN CADA UNA`, `👥 ${total} JUGADORES`, first ? `📅 DEL ${dm(first)} AL ${dm(last!)}` : ""].filter(Boolean);
  let cx = PAD; x.font = `26px ${ESC}`;
  for (const c of chips) {
    const w = x.measureText(c).width + 44;
    rr(x, cx, 396, w, 52, 26); x.fillStyle = "rgba(255,255,255,.08)"; x.fill(); x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = "#fff"; x.fillText(c, cx + 22, 431); cx += w + 14;
  }

  let y = 470;
  let wk = "";
  for (const d of o.days) {
    const w = startOfWeek(d.day);
    if (w !== wk) {
      wk = w;
      const label = `SETMANA ${weeks.indexOf(w) + 1}`;
      x.font = `34px ${ESC}`; x.letterSpacing = "8px";
      const lw = x.measureText(label).width;
      const mid = y + WK / 2 + 8;
      const lg1 = x.createLinearGradient(PAD, 0, W / 2 - lw / 2 - 20, 0); lg1.addColorStop(0, "rgba(219,179,77,0)"); lg1.addColorStop(1, "#dbb34d");
      x.fillStyle = lg1; x.fillRect(PAD, mid - 12, W / 2 - lw / 2 - 20 - PAD, 2);
      const lg2 = x.createLinearGradient(W / 2 + lw / 2 + 20, 0, W - PAD, 0); lg2.addColorStop(0, "#dbb34d"); lg2.addColorStop(1, "rgba(219,179,77,0)");
      x.fillStyle = lg2; x.fillRect(W / 2 + lw / 2 + 20, mid - 12, W - PAD - (W / 2 + lw / 2 + 20), 2);
      x.fillStyle = "#f6d77a"; x.textAlign = "center"; x.fillText(label, W / 2, mid); x.textAlign = "left"; x.letterSpacing = "0px";
      y += WK;
    }
    const h = HEAD + d.rows.length * ROW;
    // Targeta del dia
    x.save(); rr(x, PAD, y, W - PAD * 2, h, 28); x.fillStyle = "rgba(255,255,255,.06)"; x.fill(); x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 1.5; x.stroke(); x.clip();
    const hg = x.createLinearGradient(PAD, 0, W - PAD, 0); hg.addColorStop(0, "rgba(219,179,77,.22)"); hg.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = hg; x.fillRect(PAD, y, W - PAD * 2, HEAD);
    x.restore();
    // Data daurada
    const bx = PAD + 26, by = y + 18;
    rr(x, bx, by, 84, 84, 20);
    const dg = x.createLinearGradient(bx, by, bx + 84, by + 84); dg.addColorStop(0, "#f6e3a8"); dg.addColorStop(0.6, "#dbb34d"); dg.addColorStop(1, "#c79a2e");
    x.fillStyle = dg; x.fill();
    x.fillStyle = "#0b1846"; x.textAlign = "center";
    x.font = `46px ${ESC}`; x.fillText(String(Number(d.day.slice(8))), bx + 42, by + 50);
    x.font = `20px ${ESC}`; x.fillText(MONTHS[Number(d.day.slice(5, 7)) - 1], bx + 42, by + 74);
    x.textAlign = "left";
    x.fillStyle = "#fff"; x.font = `44px ${ESC}`; x.fillText(DOW_NAMES[isoDow(d.day)].toUpperCase(), bx + 106, by + 42);
    const range = d.rows.length ? `${hm(d.rows[0].start_time)} – ${endOf(d.rows[d.rows.length - 1].start_time, o.minutes)}` : "";
    x.fillStyle = "#c9d5ff"; x.font = `24px ${BODY}`; x.fillText([d.label, range].filter(Boolean).join(" · "), bx + 106, by + 76);
    // Files
    let ry = y + HEAD;
    for (const r of d.rows) {
      x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(PAD, ry, W - PAD * 2, 1.5);
      const mid = ry + ROW / 2;
      x.fillStyle = "#f6d77a"; x.font = `40px ${ESC}`; x.fillText(hm(r.start_time), PAD + 26, mid + 14);
      const tw = x.measureText(hm(r.start_time)).width;
      x.fillStyle = "#9fb0e0"; x.font = `24px ${ESC}`; x.fillText(`–${endOf(r.start_time, o.minutes)}`, PAD + 32 + tw, mid + 14);
      // Medalla del dorsal
      const mx = PAD + 272, R = 34;
      const mg = x.createRadialGradient(mx - 10, mid - 12, 4, mx, mid, R); mg.addColorStop(0, "#1d4fd0"); mg.addColorStop(0.55, "#0a2ea0"); mg.addColorStop(1, "#061847");
      x.beginPath(); x.arc(mx, mid, R, 0, Math.PI * 2); x.fillStyle = mg; x.fill(); x.strokeStyle = "#dbb34d"; x.lineWidth = 3; x.stroke();
      x.fillStyle = "#fff"; x.font = `36px ${ESC}`; x.textAlign = "center"; x.fillText(r.dorsal != null ? String(r.dorsal) : "–", mx, mid + 13); x.textAlign = "left";
      let s = 42; do { x.font = `${s}px ${ESC}`; s -= 2; } while (x.measureText(r.name.toUpperCase()).width > W - PAD * 2 - 340 && s > 24);
      x.fillStyle = "#fff"; x.fillText(r.name.toUpperCase(), PAD + 330, mid + 15);
      ry += ROW;
    }
    y += h + GAP;
  }

  // Peu
  x.globalAlpha = 0.7; x.drawImage(crest, PAD, y + 34, 40, 40); x.globalAlpha = 1;
  x.fillStyle = "rgba(255,255,255,.7)"; x.font = `24px ${ESC}`; x.letterSpacing = "4px"; x.fillText("CE EUROPA · JUVENIL C", PAD + 54, y + 63); x.letterSpacing = "0px";
  return toBlob(cv);
}

/** Agrupa per dia les files (ja ordenades) amb l'etiqueta de la franja. */
export function groupDays(rows: ImgRow[], labelOf: (day: string, t: string) => string): ImgDay[] {
  const out: ImgDay[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.day === r.day) last.rows.push(r);
    else out.push({ day: r.day, label: labelOf(r.day, r.start_time), rows: [r] });
  }
  return out;
}

export const seasonOf = (day: string) => {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  const a = m >= 7 ? y : y - 1;
  return `${a}/${String((a + 1) % 100).padStart(2, "0")}`;
};

