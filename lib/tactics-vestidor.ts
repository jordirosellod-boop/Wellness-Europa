// «La meva idea de joc»: el que l'entrenador escriu amb les seves paraules es reparteix per conceptes
// (sortida, pressió, atac, transicions, pilota aturada) i se'n fan les pissarres. I el PDF per al vestidor:
// una pàgina per concepte, amb la pissarra gran i les claus en lletra grossa.

import { HOLD, type BoardData, type PlanInput, type PlanSection, type Scene } from "@/lib/tactics";
import { sceneImage, type RenderOpts } from "@/lib/tactics-render";

type Topic = "idea" | "sortida" | "pressio" | "atac" | "transicions" | "abp";
export const TOPIC_TITLE: Record<Topic, string> = {
  idea: "Idea de joc", sortida: "Sortida de pilota", pressio: "Pressió", atac: "Atac", transicions: "Transicions", abp: "Pilota aturada",
};
const ORDER: Topic[] = ["idea", "sortida", "atac", "pressio", "transicions", "abp"];

const low = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const WORDS: [Topic, string[]][] = [
  ["abp", ["corner", "falta", "pilota aturada", "abp", "penal", "servei de banda", "fora de banda", "primer pal", "segon pal"]],
  ["transicions", ["transici", "robem", "perdem", "perdua", "contraatac", "contra-atac", "a la contra", "5 segons", "recuperem"]],
  ["sortida", ["sortida", "sortir", "sortim", "construc", "des de baix", "portera amb pilota", "pilota llarga", "en llarg", "jugar curt", "centrals obertes", "s'obren", "pivot baixa"]],
  ["pressio", ["pressi", "robar", "bloc", "replega", "salt", "orient", "tap", "linies de passada", "linies juntes", "sense pilota", "basculem", "bascular"]],
  ["atac", ["atac", "centres", "centrar", "centrem", "finalitz", "xut", "desmarc", "entre linies", "amb pilota", "area", "1 contra 1", "uno contra uno", "profunditat", "amplitud"]],
];

/** De quin concepte parla una frase (o el títol d'un apartat del pla): el que hi té més paraules. */
function topicOfText(s: string): Topic | null {
  let best: Topic | null = null, score = 0;
  for (const [t, words] of WORDS) {
    const n = words.filter((w) => low(s).includes(w)).length;
    if (n > score) { best = t; score = n; }
  }
  return best;
}

/** Els apartats del pla que fa l'automàtic també es reconeixen («Sense pilota», «Context»…). */
const topicOfSection = (title: string): Topic => topicOfText(title) ?? "idea";

function topicOfScene(s: Scene): Topic | null {
  const t = low(s.title);
  if (t.startsWith("onze")) return "idea";
  if (t.includes("sortida")) return "sortida";
  if (t.includes("pressi") || t.includes("bloc")) return "pressio";
  if (t.includes("transici")) return "transicions";
  if (t.includes("corner")) return "abp";
  return null;
}

/** Llegeix el text i en treu com vol jugar (per a les pissarres) i les frases repartides per conceptes. */
export function parseIdea(text: string): { press: PlanInput["press"]; build: PlanInput["build"]; side: PlanInput["side"]; plan: PlanSection[] } {
  const t = low(text);
  const near = (a: string, b: string) => new RegExp(`${a}[^.\\n]{0,40}\\b${b}`).test(t);
  const press: PlanInput["press"] = near("pressi", "alt") || near("pressi", "a dalt") || near("pressionar", "amunt")
    ? "alta" : near("bloc", "baix") || t.includes("replega") || near("pressi", "baix") ? "baixa" : "mitja";
  const build: PlanInput["build"] = (near("sortida", "llarg") || t.includes("pilota llarga") || t.includes("en llarg")) && !near("sortida", "curt") && !t.includes("des de baix")
    ? "llarga" : near("sortida", "curt") || t.includes("des de baix") || t.includes("sortir jugant") || t.includes("jugar curt") ? "curta" : "mixta";
  const side: PlanInput["side"] = near("ata", "dreta") || t.includes("per la dreta") ? "dreta" : near("ata", "esquerra") || t.includes("per l'esquerra") ? "esquerra" : near("ata", "dins") || t.includes("pel centre") ? "dins" : "auto";

  // Frases: una per línia o separades per punts
  const sentences = text.split(/\n+|(?<=[.!?])\s+/).map((x) => x.replace(/^[-•·*\d.)\s]+/, "").trim()).filter((x) => x.length > 2);
  const by = new Map<Topic, string[]>();
  let last: Topic = "idea";
  for (const s of sentences) {
    // «Pressió:» sol, com a títol: les frases següents són d'aquest concepte
    const head = s.match(/^([^:]{3,30}):\s*(.*)$/);
    const t: Topic = topicOfText(head ? head[1] : s) ?? (head ? "idea" : last);
    last = t;
    let line = (head ? head[2] : s).trim();
    // «Pressió: alta.» → «Pressió alta.» (si després dels dos punts hi ha només una o dues paraules)
    if (head && line && line.split(/\s+/).length <= 2) line = `${head[1].trim()} ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
    if (!line) continue;
    by.set(t, [...(by.get(t) ?? []), line.charAt(0).toUpperCase() + line.slice(1)]);
  }
  const plan = ORDER.filter((t) => by.has(t)).map((t) => ({ title: TOPIC_TITLE[t], lines: by.get(t)! }));
  return { press, build, side, plan };
}

// ---------------------------------------------------------------------------
// PDF per al vestidor
// ---------------------------------------------------------------------------

const PW_ = 1240, PH_ = 1754; // A4 a 150 ppp
const NAVY = "#0b1846", OR = "#dbb34d";

function img(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("imatge")); i.src = src; });
}
const blobImg = async (b: Blob) => { const u = URL.createObjectURL(b); try { return await img(u); } finally { setTimeout(() => URL.revokeObjectURL(u), 5000); } };

/** Moment (en segons) en què es veu sencer el fotograma i d'una escena. */
const frameTime = (s: Scene, i: number) => s.frames.slice(1, i + 1).reduce((a, f) => a + HOLD + f.dur, 0);

function wrap(x: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

type Page = { title: string; scene: Scene | null; lines: string[] };

/** Pàgines: un concepte per pàgina (amb la seva pissarra si n'hi ha) i les escenes lliures a part. */
function pages(data: BoardData): Page[] {
  const sec = new Map<Topic, string[]>();
  for (const p of data.plan ?? []) {
    const t = topicOfSection(p.title);
    sec.set(t, [...(sec.get(t) ?? []), ...p.lines.map((l) => l.trim()).filter(Boolean)]);
  }
  const out: Page[] = [];
  const used = new Set<string>();
  const onze = data.scenes.find((s) => topicOfScene(s) === "idea") ?? null;
  for (const t of ORDER) {
    const own = data.scenes.find((s) => !used.has(s.id) && topicOfScene(s) === t) ?? null;
    const lines = sec.get(t) ?? [];
    if (!own && !lines.length) continue;
    if (own) used.add(own.id);
    // Sense pissarra pròpia (p. ex. l'atac): el nostre sistema com a referència
    const scene = own ?? onze;
    out.push({ title: own && t !== "idea" ? own.title : TOPIC_TITLE[t], scene, lines: lines.length ? lines : own ? own.frames.map((f) => f.note).filter(Boolean) : [] });
  }
  for (const s of data.scenes) if (!used.has(s.id)) out.push({ title: s.title, scene: s, lines: s.frames.map((f) => f.note).filter(Boolean) });
  return out;
}

/** Imatge d'un moment de l'escena, sense la franja de títol (només el camp). */
async function pitchShot(s: Scene, t: number, o: RenderOpts): Promise<HTMLImageElement> {
  const im = await blobImg(await sceneImage(s, t, { ...o, title: undefined }));
  const bar = Math.round(im.height * 0.12);
  const c = document.createElement("canvas");
  c.width = im.width; c.height = im.height - bar;
  c.getContext("2d")!.drawImage(im, 0, bar, im.width, c.height, 0, 0, c.width, c.height);
  return img(c.toDataURL("image/png"));
}

const M = 64;
const pad2 = (n: number) => String(n).padStart(2, "0");

export async function vestidorPdf(o: { title: string; rival: string | null; date: string | null; data: BoardData; render: RenderOpts }): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const ESC = o.render.font;
  const BODY = getComputedStyle(document.body).getPropertyValue("--font-body").trim() || "sans-serif";
  await Promise.all([document.fonts.load(`100px ${ESC}`), document.fonts.load(`400 30px ${BODY}`), document.fonts.load(`600 30px ${BODY}`)]).catch(() => {});
  const crest = await img("/escut.png").catch(() => null);
  const list = pages(o.data);
  const ours = o.data.meta?.ours, theirs = o.data.meta?.theirs;

  const page = () => {
    const cv = document.createElement("canvas");
    cv.width = PW_; cv.height = PH_;
    return { cv, x: cv.getContext("2d")! };
  };
  const fit = (x: CanvasRenderingContext2D, t: string, font: string, size: number, max: number) => {
    let s2 = size; do { x.font = `${s2}px ${font}`; s2 -= 2; } while (x.measureText(t).width > max && s2 > 14);
  };
  const drawCrest = (x: CanvasRenderingContext2D, im: HTMLImageElement | null | undefined, cx: number, cy: number, box: number) => {
    if (!im) return;
    const k = Math.min(box / im.naturalWidth, box / im.naturalHeight);
    x.drawImage(im, cx - (im.naturalWidth * k) / 2, cy - (im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
  };
  const escapulat = (x: CanvasRenderingContext2D, top: number, w: number, alpha: number) => {
    const ky = (w * 230) / 92 / 1080, kx = w / 200;
    x.fillStyle = `rgba(255,255,255,${alpha})`;
    x.beginPath(); x.moveTo(0, top); x.lineTo(100 * kx, top + 62 * ky); x.lineTo(w, top); x.lineTo(w, top + 22 * ky); x.lineTo(100 * kx, top + 84 * ky); x.lineTo(0, top + 22 * ky); x.closePath(); x.fill();
  };
  const footer = (x: CanvasRenderingContext2D, dark = false) => {
    x.fillStyle = dark ? "#030c2e" : NAVY; x.fillRect(0, PH_ - 80, PW_, 80);
    x.fillStyle = OR; x.fillRect(0, PH_ - 80, PW_, 5);
    x.textBaseline = "middle"; x.font = `32px ${ESC}`; x.fillStyle = OR;
    x.textAlign = "left"; x.fillText("FORÇA EUROPA", M, PH_ - 38);
    x.textAlign = "right"; x.fillText(["JUVENIL C", o.date ? o.date.toUpperCase() : null].filter(Boolean).join(" · "), PW_ - M, PH_ - 38);
  };
  const shots: { cv: HTMLCanvasElement }[] = [];

  // ---------- Portada ----------
  {
    const { cv, x } = page();
    const g = x.createLinearGradient(0, 0, PW_, PH_);
    g.addColorStop(0, "#030c2e"); g.addColorStop(0.55, "#0a2a8a"); g.addColorStop(1, "#030c2e");
    x.fillStyle = g; x.fillRect(0, 0, PW_, PH_);
    if (crest) { x.save(); x.globalAlpha = 0.06; drawCrest(x, crest, PW_ * 0.62, PH_ * 0.46, 1100); x.restore(); }
    escapulat(x, 0, PW_, 0.07);
    x.fillStyle = OR; x.fillRect(0, 0, PW_, 10);
    drawCrest(x, crest, M + 70, 190, 140);
    x.textAlign = "left"; x.textBaseline = "alphabetic";
    x.fillStyle = OR; x.font = `34px ${ESC}`; x.fillText("CE EUROPA · JUVENIL C", M + 170, 176);
    x.fillStyle = "rgba(255,255,255,.8)"; x.font = `30px ${ESC}`; x.fillText("DOSSIER TÀCTIC DEL VESTIDOR", M + 170, 220);
    x.fillStyle = "#fff"; fit(x, "IDEA DE JOC", ESC, 230, PW_ - 2 * M); x.fillText("IDEA DE JOC", M, 520);
    if (o.rival) { x.fillStyle = OR; fit(x, `VS ${o.rival.toUpperCase()}`, ESC, 96, PW_ - 2 * M); x.fillText(`VS ${o.rival.toUpperCase()}`, M, 630); }
    if (o.date) { x.fillStyle = "rgba(255,255,255,.85)"; x.font = `44px ${ESC}`; x.fillText(o.date.toUpperCase(), M, 700); }
    // Escuts i sistemes
    const cy = 860;
    x.fillStyle = "rgba(255,255,255,.07)"; x.beginPath(); x.roundRect(M, cy - 110, PW_ - 2 * M, 220, 28); x.fill();
    drawCrest(x, o.render.crestUs, M + 140, cy, 150);
    drawCrest(x, o.render.crestRival, PW_ - M - 140, cy, 150);
    x.textAlign = "center"; x.fillStyle = OR; x.font = `40px ${ESC}`; x.fillText("VS", PW_ / 2, cy - 30);
    if (ours && theirs) { x.fillStyle = "#fff"; x.font = `64px ${ESC}`; x.fillText(`${ours}  ·  ${theirs}`, PW_ / 2, cy + 50); }
    // Índex
    let y = 1080;
    x.textAlign = "left"; x.fillStyle = OR; x.font = `36px ${ESC}`; x.fillText("CONTINGUT", M, y);
    x.fillRect(M + x.measureText("CONTINGUT").width + 20, y - 12, PW_ - 2 * M - x.measureText("CONTINGUT").width - 20, 3);
    y += 30;
    const rowH = Math.min(70, (PH_ - 140 - y) / Math.max(1, list.length));
    list.forEach((pg, i) => {
      const yy = y + rowH * (i + 0.7);
      x.textAlign = "left"; x.fillStyle = OR; x.font = `${Math.min(52, rowH * 0.8)}px ${ESC}`; x.fillText(pad2(i + 1), M, yy);
      x.fillStyle = "#fff"; fit(x, pg.title.toUpperCase(), ESC, Math.min(48, rowH * 0.72), PW_ - 2 * M - 220); x.fillText(pg.title.toUpperCase(), M + 110, yy);
      x.textAlign = "right"; x.fillStyle = "rgba(255,255,255,.6)"; x.font = `${Math.min(34, rowH * 0.5)}px ${ESC}`; x.fillText(`PÀG. ${i + 2}`, PW_ - M, yy);
      x.fillStyle = "rgba(255,255,255,.1)"; x.fillRect(M, yy + rowH * 0.28, PW_ - 2 * M, 1.5);
    });
    footer(x, true);
    shots.push({ cv });
  }

  // ---------- Un concepte per pàgina ----------
  for (let pi = 0; pi < list.length; pi++) {
    const pg = list[pi];
    const { cv, x } = page();
    x.fillStyle = "#fff"; x.fillRect(0, 0, PW_, PH_);

    // Capçalera: número gran, títol i escuts
    const HB = 196;
    const g = x.createLinearGradient(0, 0, PW_, HB);
    g.addColorStop(0, "#030c2e"); g.addColorStop(0.6, NAVY); g.addColorStop(1, "#022e91");
    x.fillStyle = g; x.fillRect(0, 0, PW_, HB);
    escapulat(x, 0, PW_, 0.05);
    x.fillStyle = OR; x.fillRect(0, HB, PW_, 7);
    x.textBaseline = "alphabetic"; x.textAlign = "left";
    x.fillStyle = OR; x.font = `150px ${ESC}`; x.fillText(pad2(pi + 1), M - 6, 158);
    const nx = M + x.measureText(pad2(pi + 1)).width + 26;
    x.fillStyle = "rgba(255,255,255,.75)"; x.font = `28px ${ESC}`;
    x.fillText(["IDEA DE JOC", o.rival ? `VS ${o.rival.toUpperCase()}` : null].filter(Boolean).join(" · "), nx, 82);
    x.fillStyle = "#fff"; fit(x, pg.title.toUpperCase(), ESC, 86, PW_ - nx - M - 190); x.fillText(pg.title.toUpperCase(), nx, 158);
    drawCrest(x, o.render.crestUs, PW_ - M - 140, HB / 2, 86);
    drawCrest(x, o.render.crestRival, PW_ - M - 40, HB / 2, 86);

    let y = HB + 40;
    if (pg.scene) {
      const s2 = pg.scene, n = s2.frames.length;
      // La pissarra gran, dins un marc del club
      const big = await pitchShot(s2, frameTime(s2, n - 1), o.render);
      const maxW = PW_ - 2 * M - 28, maxH = n > 1 ? 590 : 860;
      const k = Math.min(maxW / big.width, maxH / big.height), bw = big.width * k, bh = big.height * k;
      const fx = (PW_ - bw) / 2 - 14;
      x.save(); x.shadowColor = "rgba(1,20,70,.3)"; x.shadowBlur = 30; x.shadowOffsetY = 10;
      x.fillStyle = NAVY; x.beginPath(); x.roundRect(fx, y, bw + 28, bh + 28, 22); x.fill(); x.restore();
      x.drawImage(big, fx + 14, y + 14, bw, bh);
      y += bh + 28 + 18;
      // Llegenda
      x.textBaseline = "middle"; x.textAlign = "left"; x.font = `22px ${ESC}`;
      let lx = (PW_ - 860) / 2;
      const item = (draw: () => void, label: string) => { draw(); x.fillStyle = "#55608a"; x.fillText(label, lx + 40, y + 14); lx += 40 + x.measureText(label).width + 34; };
      item(() => { x.fillStyle = "#0a2ea0"; x.beginPath(); x.arc(lx + 14, y + 14, 12, 0, 7); x.fill(); x.strokeStyle = OR; x.lineWidth = 3; x.stroke(); }, "NOSALTRES");
      item(() => { x.fillStyle = "#d32f2f"; x.beginPath(); x.arc(lx + 14, y + 14, 12, 0, 7); x.fill(); }, "RIVAL");
      item(() => { x.strokeStyle = "#e0b800"; x.lineWidth = 4; x.setLineDash([]); x.beginPath(); x.moveTo(lx, y + 14); x.lineTo(lx + 30, y + 14); x.stroke(); }, "PASSADA");
      item(() => { x.strokeStyle = "#8a93b5"; x.lineWidth = 4; x.setLineDash([8, 6]); x.beginPath(); x.moveTo(lx, y + 14); x.lineTo(lx + 30, y + 14); x.stroke(); x.setLineDash([]); }, "DESMARCATGE");
      item(() => { x.fillStyle = "rgba(255,212,0,.35)"; x.fillRect(lx, y + 2, 30, 24); x.strokeStyle = "#e0b800"; x.lineWidth = 2; x.setLineDash([5, 4]); x.strokeRect(lx, y + 2, 30, 24); x.setLineDash([]); }, "ZONA");
      y += 54;

      // Seqüència: els passos amb la seva frase
      if (n > 1) {
        const steps = Math.min(3, n), gap = 24;
        x.textBaseline = "alphabetic"; x.fillStyle = NAVY; x.font = `34px ${ESC}`; x.fillText("SEQÜÈNCIA", M, y + 26);
        x.fillStyle = OR; x.fillRect(M + x.measureText("SEQÜÈNCIA").width + 18, y + 14, PW_ - 2 * M - x.measureText("SEQÜÈNCIA").width - 18, 3);
        y += 48;
        let sw = (PW_ - 2 * M - gap * (steps - 1)) / steps, sh = 0;
        const imgs: { im: HTMLImageElement; note: string }[] = [];
        for (let i = 0; i < steps; i++) {
          const fi = steps === n ? i : Math.round((i * (n - 1)) / (steps - 1));
          imgs.push({ im: await pitchShot(s2, frameTime(s2, fi), o.render), note: s2.frames[fi].note });
        }
        for (const it of imgs) sw = Math.min(sw, (190 * it.im.width) / it.im.height);
        // Cada pas té una columna prou ampla per a la frase (el mig camp és més estret que alt)
        const col = Math.max(sw, Math.min(340, (PW_ - 2 * M - gap * (steps - 1)) / steps));
        const x0 = (PW_ - (col * steps + gap * (steps - 1))) / 2;
        let capH = 0;
        imgs.forEach((it, i) => {
          sh = (sw * it.im.height) / it.im.width;
          const cx0 = x0 + i * (col + gap), sx = cx0 + (col - sw) / 2;
          x.save(); x.beginPath(); x.roundRect(sx, y, sw, sh, 12); x.clip(); x.drawImage(it.im, sx, y, sw, sh); x.restore();
          x.fillStyle = OR; x.beginPath(); x.arc(sx + 28, y + 28, 22, 0, 7); x.fill();
          x.fillStyle = NAVY; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `28px ${ESC}`; x.fillText(String(i + 1), sx + 28, y + 30);
          x.textAlign = "left"; x.textBaseline = "alphabetic"; x.fillStyle = "#3d4a78"; x.font = `500 21px ${BODY}`;
          const ls = wrap(x, it.note, col).slice(0, 3);
          ls.forEach((l, j) => x.fillText(l, cx0, y + sh + 30 + j * 27));
          capH = Math.max(capH, ls.length * 27);
        });
        y += sh + capH + 34;
      }
    }

    // Claus: requadre blau, numerades en daurat
    const keys = pg.lines.slice(0, 8);
    if (keys.length) {
      const boxTop = y + 6, boxBottom = PH_ - 80 - 36, innerW = PW_ - 2 * M - 120;
      let fs = pg.scene ? 32 : 44, wrapped: string[][] = [];
      for (; fs >= 20; fs -= 2) {
        x.font = `500 ${fs}px ${BODY}`;
        wrapped = keys.map((k2) => wrap(x, k2, innerW));
        const need = 90 + wrapped.reduce((a, w) => a + w.length * fs * 1.32 + fs * 0.75, 0);
        if (need <= boxBottom - boxTop) break;
      }
      const need = 90 + wrapped.reduce((a, w) => a + w.length * fs * 1.32 + fs * 0.75, 0);
      const bh = Math.min(boxBottom - boxTop, need + 10);
      const bg = x.createLinearGradient(0, boxTop, 0, boxTop + bh);
      bg.addColorStop(0, NAVY); bg.addColorStop(1, "#0f2a7a");
      x.fillStyle = bg; x.beginPath(); x.roundRect(M, boxTop, PW_ - 2 * M, bh, 24); x.fill();
      x.fillStyle = OR; x.fillRect(M + 36, boxTop + 70, 70, 4);
      x.textAlign = "left"; x.textBaseline = "alphabetic"; x.font = `36px ${ESC}`; x.fillText("CLAUS", M + 36, boxTop + 54);
      let ky = boxTop + 96;
      wrapped.forEach((ws, i) => {
        if (ky + fs > boxTop + bh) return;
        x.fillStyle = OR; x.beginPath(); x.arc(M + 58, ky + fs * 0.42, fs * 0.62, 0, 7); x.fill();
        x.fillStyle = NAVY; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `${Math.round(fs * 0.8)}px ${ESC}`; x.fillText(String(i + 1), M + 58, ky + fs * 0.48);
        x.textAlign = "left"; x.textBaseline = "alphabetic"; x.fillStyle = "#fff"; x.font = `500 ${fs}px ${BODY}`;
        ws.forEach((w, j) => x.fillText(w, M + 100, ky + fs * (0.8 + j * 1.32)));
        ky += ws.length * fs * 1.32 + fs * 0.75;
      });
    }
    footer(x);
    shots.push({ cv });
  }

  shots.forEach(({ cv }, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297);
  });
  return pdf.output("blob");
}
