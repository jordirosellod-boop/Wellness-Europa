// Dibuix de la pissarra en un canvas (per a la imatge, el vídeo i el PDF). La pantalla fa servir SVG.

import { COLORS, PH, PW, sceneAt, sceneLength, type Scene, type TShape, type XY } from "@/lib/tactics";

export type RenderOpts = { font: string; title?: string; showNames: boolean; crestUs?: HTMLImageElement | null; crestRival?: HTMLImageElement | null };

const BAR = 0.12; // part de dalt reservada al títol i a la nota

/** Mida del canvas per a una escena (camp sencer o mig camp), amb franja de títol. */
export function canvasSize(s: Scene, width = 1280) {
  const vw = s.view === "half" ? PW / 2 + 4 : PW + 4;
  const vh = PH + 4;
  const h = Math.round((width * vh) / vw / (1 - BAR));
  return { w: width, h: h + (h % 2) };
}

function pitch(ctx: CanvasRenderingContext2D, k: number) {
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? "#2f9a42" : "#2a8a3b";
    ctx.fillRect(((i * PW) / 12) * k, 0, (PW / 12) * k + 1, PH * k);
  }
  ctx.strokeStyle = "rgba(255,255,255,.92)";
  ctx.lineWidth = 0.32 * k;
  const R = (x: number, y: number, w: number, h: number) => ctx.strokeRect(x * k, y * k, w * k, h * k);
  R(0, 0, PW, PH);
  ctx.beginPath();
  ctx.moveTo((PW / 2) * k, 0);
  ctx.lineTo((PW / 2) * k, PH * k);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc((PW / 2) * k, (PH / 2) * k, 9.15 * k, 0, Math.PI * 2);
  ctx.stroke();
  for (const left of [true, false]) {
    const x0 = left ? 0 : PW;
    const s = left ? 1 : -1;
    R(left ? 0 : PW - 16.5, PH / 2 - 20.16, 16.5, 40.32);
    R(left ? 0 : PW - 5.5, PH / 2 - 9.16, 5.5, 18.32);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left ? 16.5 * k : 0, 0, left ? PW * k : (PW - 16.5) * k, PH * k);
    ctx.clip();
    ctx.beginPath();
    ctx.arc((x0 + s * 11) * k, (PH / 2) * k, 9.15 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.arc((x0 + s * 11) * k, (PH / 2) * k, 0.3 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.fillRect(left ? -1.6 * k : PW * k, (PH / 2 - 3.66) * k, 1.6 * k, 7.32 * k);
  }
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.beginPath();
  ctx.arc((PW / 2) * k, (PH / 2) * k, 0.3 * k, 0, Math.PI * 2);
  ctx.fill();
}

function arrowHead(ctx: CanvasRenderingContext2D, a: XY, b: XY, k: number, c: string) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const L = 1.8 * k;
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(b[0] * k, b[1] * k);
  ctx.lineTo(b[0] * k - Math.cos(ang - 0.45) * L, b[1] * k - Math.sin(ang - 0.45) * L);
  ctx.lineTo(b[0] * k - Math.cos(ang + 0.45) * L, b[1] * k - Math.sin(ang + 0.45) * L);
  ctx.closePath();
  ctx.fill();
}

/** Punts d'una conducció (línia en zig-zag). */
export function zigzag(a: XY, b: XY, amp = 0.7, step = 1.6): XY[] {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d < 0.5) return [a, b];
  const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
  const n = Math.max(2, Math.floor((d - 2) / step));
  const out: XY[] = [a];
  for (let i = 1; i < n; i++) {
    const t = (i * step) / d;
    const s = i % 2 ? amp : -amp;
    out.push([a[0] + (b[0] - a[0]) * t - uy * s, a[1] + (b[1] - a[1]) * t + ux * s]);
  }
  out.push([a[0] + ux * (d - 1.2), a[1] + uy * (d - 1.2)], b);
  return out;
}

function drawShape(ctx: CanvasRenderingContext2D, s: TShape, k: number, font: string, alpha: number) {
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = 0.45 * k;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.k === "pass" || s.k === "run" || s.k === "line") {
    if (s.k === "run") ctx.setLineDash([1.2 * k, 0.9 * k]);
    ctx.beginPath();
    ctx.moveTo(a[0] * k, a[1] * k);
    ctx.lineTo(b[0] * k, b[1] * k);
    ctx.stroke();
    ctx.setLineDash([]);
    if (s.k !== "line") arrowHead(ctx, a, b, k, s.c);
  } else if (s.k === "dribble") {
    const z = zigzag(a, b);
    ctx.beginPath();
    z.forEach((p, i) => (i ? ctx.lineTo(p[0] * k, p[1] * k) : ctx.moveTo(p[0] * k, p[1] * k)));
    ctx.stroke();
    arrowHead(ctx, z[z.length - 2], b, k, s.c);
  } else if (s.k === "zone") {
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    ctx.globalAlpha = alpha * 0.25;
    ctx.fillRect(x * k, y * k, w * k, h * k);
    ctx.globalAlpha = alpha;
    ctx.setLineDash([0.8 * k, 0.6 * k]);
    ctx.strokeRect(x * k, y * k, w * k, h * k);
  } else if (s.k === "ellipse") {
    ctx.globalAlpha = alpha * 0.22;
    ctx.beginPath();
    ctx.ellipse(((a[0] + b[0]) / 2) * k, ((a[1] + b[1]) / 2) * k, (Math.abs(b[0] - a[0]) / 2) * k, (Math.abs(b[1] - a[1]) / 2) * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.stroke();
  } else if (s.k === "free") {
    ctx.beginPath();
    s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * k, p[1] * k) : ctx.moveTo(p[0] * k, p[1] * k)));
    ctx.stroke();
  } else if (s.k === "text" && s.text) {
    ctx.font = `400 ${2.6 * k}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 0.5 * k;
    ctx.strokeStyle = "rgba(0,0,0,.65)";
    ctx.strokeText(s.text.toUpperCase(), a[0] * k, a[1] * k);
    ctx.fillText(s.text.toUpperCase(), a[0] * k, a[1] * k);
  }
  ctx.restore();
}

/** Dibuixa l'escena tal com està al segon `t` de l'animació. */
export function drawSceneAt(ctx: CanvasRenderingContext2D, W: number, H: number, s: Scene, t: number, o: RenderOpts) {
  const st = sceneAt(s, t);
  const bar = Math.round(H * BAR);
  // franja de títol
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "#0b1846");
  g.addColorStop(1, "#0a2ea0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let tx = bar * 0.25;
  for (const img of [o.crestUs, o.crestRival]) {
    if (!img) continue;
    const sz = bar * 0.72;
    const kk = Math.min(sz / img.naturalWidth, sz / img.naturalHeight);
    ctx.drawImage(img, tx, (bar - img.naturalHeight * kk) / 2, img.naturalWidth * kk, img.naturalHeight * kk);
    tx += sz + bar * 0.12;
  }
  ctx.fillStyle = "#fff";
  ctx.font = `400 ${Math.round(bar * 0.38)}px ${o.font}`;
  ctx.fillText((o.title ? `${o.title} · ` : "") + s.title.toUpperCase(), tx + bar * 0.1, bar * 0.36);
  const note = s.frames[st.moving ?? st.frame]?.note || s.frames[st.frame]?.note || "";
  ctx.fillStyle = "#dbb34d";
  ctx.font = `400 ${Math.round(bar * 0.24)}px ${o.font}`;
  ctx.fillText(note.toUpperCase().slice(0, 140), tx + bar * 0.1, bar * 0.74);

  // camp
  const vx0 = s.view === "half" ? PW / 2 - 2 : -2;
  const vw = s.view === "half" ? PW / 2 + 4 : PW + 4;
  const k = W / vw;
  ctx.save();
  ctx.translate(-vx0 * k, bar + 2 * k);
  ctx.beginPath();
  ctx.rect(vx0 * k, -2 * k, vw * k, (PH + 4) * k);
  ctx.clip();
  ctx.fillStyle = "#24803a";
  ctx.fillRect(vx0 * k, -2 * k, vw * k, (PH + 4) * k);
  pitch(ctx, k);

  // dibuixos del fotograma (s'esvaeixen mentre les jugadores es mouen)
  const shapes = s.frames[st.frame]?.shapes ?? [];
  const alpha = st.moving == null ? 1 : Math.max(0, 1 - st.k * 1.4);
  for (const sh of shapes) drawShape(ctx, sh, k, o.font, alpha);

  // fitxes
  for (const tok of s.tokens) {
    const p = st.pos[tok.id];
    if (!p) continue;
    const [x, y] = [p[0] * k, p[1] * k];
    if (tok.t === "ball") {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 0.2 * k;
      ctx.beginPath();
      ctx.arc(x, y, 0.85 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(x, y, 0.32 * k, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (tok.t === "cone") {
      ctx.fillStyle = tok.c ?? "#ff8f1f";
      ctx.beginPath();
      ctx.moveTo(x, y - 1.2 * k);
      ctx.lineTo(x + 1 * k, y + 0.8 * k);
      ctx.lineTo(x - 1 * k, y + 0.8 * k);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    const fill = tok.side === "us" ? (tok.gk ? COLORS.usGk : COLORS.us) : tok.gk ? COLORS.rivalGk : COLORS.rival;
    const text = tok.side === "us" && tok.gk ? "#0b1846" : "#fff";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 0.8 * k;
    ctx.shadowOffsetY = 0.25 * k;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, 2.05 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = tok.side === "us" ? "#dbb34d" : "#fff";
    ctx.lineWidth = 0.32 * k;
    ctx.beginPath();
    ctx.arc(x, y, 2.05 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `400 ${2.5 * k}px ${o.font}`;
    ctx.fillText(tok.n, x, y + 0.15 * k);
    if (o.showNames && tok.name) {
      ctx.font = `400 ${1.45 * k}px ${o.font}`;
      ctx.lineWidth = 0.45 * k;
      ctx.strokeStyle = "rgba(0,0,0,.7)";
      ctx.strokeText(tok.name.toUpperCase(), x, y + 3.4 * k);
      ctx.fillStyle = "#fff";
      ctx.fillText(tok.name.toUpperCase(), x, y + 3.4 * k);
    }
  }
  ctx.restore();
}

/** Vídeo MP4 d'una o més escenes animades (fet al dispositiu). */
export async function scenesVideo(scenes: Scene[], o: RenderOpts, onProgress?: (p: number) => void): Promise<Blob> {
  const mb = await import("mediabunny");
  if (typeof VideoEncoder === "undefined") throw new Error("Aquest navegador no pot fer vídeos.");
  const { w: W, h: H } = canvasSize({ ...scenes[0], view: "full" }, 1280);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "hevc", "av1"], { width: W, height: H });
  if (!codec) throw new Error("Aquest dispositiu no pot crear vídeos.");
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const src = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(src, { frameRate: 30 });
  await output.start();
  const fps = 30;
  const total = scenes.reduce((a, s) => a + sceneLength(s) + 0.6, 0);
  let cursor = 0;
  for (const s of scenes) {
    const len = sceneLength(s) + 0.6; // una mica de pausa al final
    const view: Scene = { ...s, view: "full" }; // al vídeo, totes amb el camp sencer (mateixa mida)
    for (let i = 0; i < Math.ceil(len * fps); i++) {
      ctx.clearRect(0, 0, W, H);
      drawSceneAt(ctx, W, H, view, Math.min(i / fps, len), o);
      await src.add(cursor + i / fps, 1 / fps);
      if (i % 10 === 0) onProgress?.(Math.min(1, (cursor + i / fps) / total));
    }
    cursor += Math.ceil(len * fps) / fps;
  }
  await output.finalize();
  const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
  if (!buf) throw new Error("No s'ha pogut crear el vídeo.");
  return new Blob([buf], { type: "video/mp4" });
}

/** Imatge PNG d'un moment d'una escena. */
export async function sceneImage(s: Scene, t: number, o: RenderOpts): Promise<Blob> {
  const { w, h } = canvasSize(s, 1600);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  drawSceneAt(c.getContext("2d")!, w, h, s, t, o);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No s'ha pogut fer la imatge."))), "image/png"));
}

export function loadImg(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}
