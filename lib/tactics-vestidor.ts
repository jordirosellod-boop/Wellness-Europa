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

export async function vestidorPdf(o: { title: string; rival: string | null; date: string | null; data: BoardData; render: RenderOpts }): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const ESC = o.render.font;
  await document.fonts.load(`100px ${ESC}`).catch(() => {});
  const crest = await img("/escut.png").catch(() => null);
  const list = pages(o.data);

  for (let pi = 0; pi < list.length; pi++) {
    const pg = list[pi];
    const cv = document.createElement("canvas");
    cv.width = PW_; cv.height = PH_;
    const x = cv.getContext("2d")!;
    x.fillStyle = "#fff"; x.fillRect(0, 0, PW_, PH_);

    // Capçalera del club
    const g = x.createLinearGradient(0, 0, PW_, 230);
    g.addColorStop(0, "#04103a"); g.addColorStop(0.5, NAVY); g.addColorStop(1, "#022e91");
    x.fillStyle = g; x.fillRect(0, 0, PW_, 230);
    x.fillStyle = OR; x.fillRect(0, 230, PW_, 8);
    if (crest) x.drawImage(crest, 56, 50, 130, 130);
    x.textBaseline = "alphabetic"; x.textAlign = "left";
    x.fillStyle = OR; x.font = `30px ${ESC}`;
    x.fillText(["CE EUROPA · JUVENIL C", o.rival ? `VS ${o.rival.toUpperCase()}` : null].filter(Boolean).join(" · "), 214, 92);
    let ts = 96; x.font = `${ts}px ${ESC}`;
    while (x.measureText(pg.title.toUpperCase()).width > PW_ - 214 - 200 && ts > 40) { ts -= 4; x.font = `${ts}px ${ESC}`; }
    x.fillStyle = "#fff"; x.fillText(pg.title.toUpperCase(), 214, 180);
    // Número de pàgina
    x.fillStyle = OR; x.beginPath(); x.roundRect(PW_ - 56 - 130, 86, 130, 64, 32); x.fill();
    x.fillStyle = NAVY; x.textAlign = "center"; x.font = `36px ${ESC}`; x.fillText(`${pi + 1} / ${list.length}`, PW_ - 56 - 65, 131);

    let y = 274;
    if (pg.scene) {
      const s = pg.scene;
      const n = s.frames.length;
      // La pissarra gran: el moment final (amb el que ha de passar)
      const big = await blobImg(await sceneImage(s, frameTime(s, n - 1), { ...o.render, title: undefined }));
      const bw = PW_ - 112, bh = Math.min(760, (bw * big.height) / big.width), bwx = (bh * big.width) / big.height;
      x.save(); x.shadowColor = "rgba(1,20,70,.25)"; x.shadowBlur = 24; x.shadowOffsetY = 8;
      x.drawImage(big, (PW_ - bwx) / 2, y, bwx, bh); x.restore();
      y += bh + 26;
      // Els passos, en petit i numerats
      if (n > 1) {
        const steps = Math.min(3, n);
        const gap = 22;
        let sw = (PW_ - 112 - gap * (steps - 1)) / steps, sh = 0;
        for (let i = 0; i < steps; i++) {
          const fi = steps === n ? i : Math.round((i * (n - 1)) / (steps - 1));
          const im = await blobImg(await sceneImage(s, frameTime(s, fi), { ...o.render, title: undefined }));
          sw = Math.min(sw, (240 * im.width) / im.height); // els passos, com a molt 240 px d'alt
          sh = (sw * im.height) / im.width;
          const sx = (PW_ - (sw * steps + gap * (steps - 1))) / 2 + i * (sw + gap);
          x.drawImage(im, sx, y, sw, sh);
          x.fillStyle = OR; x.beginPath(); x.arc(sx + 30, y + 30, 24, 0, Math.PI * 2); x.fill();
          x.fillStyle = NAVY; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `30px ${ESC}`; x.fillText(String(i + 1), sx + 30, y + 32);
          x.textBaseline = "alphabetic";
        }
        y += sh + 30;
      }
    }

    // Les claus, en gran
    const keys = pg.lines.slice(0, 8);
    if (keys.length) {
      x.textAlign = "left";
      x.fillStyle = NAVY; x.font = `40px ${ESC}`; x.fillText("CLAUS", 56, y + 34);
      x.fillStyle = OR; x.fillRect(56 + x.measureText("CLAUS").width + 16, y + 20, PW_ - 112 - x.measureText("CLAUS").width - 16, 4);
      y += 70;
      const room = PH_ - 120 - y;
      let fs = pg.scene ? 34 : 46;
      let wrapped: string[][] = [];
      for (; fs >= 22; fs -= 2) {
        x.font = `${fs}px sans-serif`;
        wrapped = keys.map((k) => wrap(x, k, PW_ - 112 - 60));
        const need = wrapped.reduce((a, w) => a + w.length * fs * 1.3 + fs * 0.6, 0);
        if (need <= room) break;
      }
      x.font = `${fs}px sans-serif`;
      wrapped.forEach((ws) => {
        if (y + fs > PH_ - 120) return;
        x.fillStyle = OR; x.beginPath(); x.roundRect(56, y + fs * 0.15, 14, fs * 0.8, 4); x.fill();
        x.fillStyle = NAVY;
        ws.forEach((w, i) => x.fillText(w, 56 + 40, y + fs * (i * 1.3 + 0.9)));
        y += ws.length * fs * 1.3 + fs * 0.6;
      });
    }

    // Peu
    x.fillStyle = NAVY; x.fillRect(0, PH_ - 84, PW_, 84);
    x.fillStyle = OR; x.fillRect(0, PH_ - 84, PW_, 6);
    x.textBaseline = "middle"; x.font = `34px ${ESC}`;
    x.textAlign = "left"; x.fillText("FORÇA EUROPA", 56, PH_ - 40);
    x.textAlign = "right"; x.fillText(o.date ? o.date.toUpperCase() : "JUVENIL C", PW_ - 56, PH_ - 40);

    if (pi > 0) pdf.addPage();
    pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297);
  }
  return pdf.output("blob");
}
