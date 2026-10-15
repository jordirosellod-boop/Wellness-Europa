// Talls de vídeo fets al mateix dispositiu (el vídeo no es puja enlloc).
// Es llegeix el fitxer del partit, es tallen els trossos de cada acció, s'hi posa el títol de cada apartat
// i el nom de l'acció a sobre, i es fa un MP4 nou. Fa servir el xip de vídeo del dispositiu (WebCodecs).

import type { Shape } from "@/components/telestrator";

export type Clip = {
  start: number; // segons del vídeo original
  end: number;
  label: string; // p. ex. «Pressió · 23'»
  sub?: string; // p. ex. jugadora i resultat
  color: string;
  drawing?: Shape[] | null;
  drawAt?: number; // segon del vídeo on es congela per mostrar el dibuix
  team?: "us" | "rival"; // per posar l'escut de l'equip a l'etiqueta
};
export type Section = { title: string; sub: string; color: string; clips: Clip[] };

export type ExportOptions = {
  intro?: { title: string; sub: string } | null; // pantalla inicial (vídeo amb tots els apartats)
  cards: boolean; // títol a l'inici de cada apartat
  overlay: boolean; // nom de l'acció a sobre del vídeo
  drawings: boolean; // pausa amb el dibuix
  font: string; // família de la lletra (Escapulada)
  crests?: { us: string | null; rival: string | null }; // adreces dels escuts (de l'app)
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

const CARD_S = 2.5;
const FREEZE_S = 3;
const MAX_W = 1280;
const MAX_H = 720;

export class ExportError extends Error {}

/** Durada total aproximada (per mostrar-la abans de començar). */
export function totalSeconds(sections: Section[], o: Pick<ExportOptions, "cards" | "drawings" | "intro">) {
  let t = o.intro ? CARD_S : 0;
  for (const s of sections) {
    if (o.cards) t += CARD_S;
    for (const c of s.clips) t += c.end - c.start + (o.drawings && c.drawing?.length ? FREEZE_S : 0);
  }
  return t;
}

/** `file`: el fitxer del dispositiu o l'adreça del vídeo (Veo). */
export async function exportClips(file: File | string, sections: Section[], o: ExportOptions): Promise<Blob> {
  const mb = await import("mediabunny");
  if (typeof VideoEncoder === "undefined") {
    throw new ExportError("Aquest navegador no pot fer vídeos. Fes servir Safari (iPad/iPhone actualitzat) o Chrome.");
  }
  const input = new mb.Input({ source: typeof file === "string" ? new mb.UrlSource(file) : new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const vTrack = await input.getPrimaryVideoTrack();
    if (!vTrack || !(await vTrack.canDecode())) throw new ExportError("No es pot llegir el vídeo d'aquest fitxer en aquest dispositiu.");
    const aTrackRaw = await input.getPrimaryAudioTrack();
    const aTrack = aTrackRaw && (await aTrackRaw.canDecode().catch(() => false)) ? aTrackRaw : null;

    // Mida de sortida: com l'original, com a molt 1280x720 (fitxers més lleugers per enviar).
    const k = Math.min(1, MAX_W / vTrack.displayWidth, MAX_H / vTrack.displayHeight);
    const W = Math.round((vTrack.displayWidth * k) / 2) * 2;
    const H = Math.round((vTrack.displayHeight * k) / 2) * 2;

    const vCodec = await mb.getFirstEncodableVideoCodec(["avc", "hevc", "vp9", "av1"], { width: W, height: H });
    if (!vCodec) throw new ExportError("Aquest dispositiu no pot crear vídeos.");
    // Si el dispositiu no pot fer el so, el vídeo surt igualment (sense so).
    const aCodec = aTrack && typeof AudioEncoder !== "undefined"
      ? await mb
          .getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: aTrack.numberOfChannels, sampleRate: aTrack.sampleRate })
          .catch(() => null)
      : null;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const vSrc = new mb.CanvasSource(canvas, { codec: vCodec, bitrate: mb.QUALITY_MEDIUM, keyFrameInterval: 2 });
    output.addVideoTrack(vSrc, { frameRate: 30 });
    const aSrc = aTrack && aCodec ? new mb.AudioSampleSource({ codec: aCodec, bitrate: 128_000 }) : null;
    if (aSrc) output.addAudioTrack(aSrc);
    await output.start();

    const frames = new mb.CanvasSink(vTrack, { width: W, height: H, fit: "contain", poolSize: 2 });
    const audio = aTrack && aSrc ? new mb.AudioSampleSink(aTrack) : null;
    const total = totalSeconds(sections, o);
    let cursor = 0; // segons ja escrits al vídeo nou
    const progress = () => o.onProgress?.(Math.min(1, cursor / total));
    const check = () => {
      if (o.signal?.aborted) throw new DOMException("Cancel·lat", "AbortError");
    };

    const silence = async (seconds: number) => {
      if (!aSrc || !aTrack) return;
      const rate = aTrack.sampleRate;
      const ch = aTrack.numberOfChannels;
      const chunk = Math.round(rate / 2); // mig segon
      for (let done = 0; done < seconds * rate; done += chunk) {
        const n = Math.min(chunk, Math.round(seconds * rate) - done);
        if (n <= 0) break;
        const s = new mb.AudioSample({ data: new Float32Array(n * ch), format: "f32-planar", numberOfChannels: ch, sampleRate: rate, timestamp: cursor + done / rate });
        await aSrc.add(s);
        s.close();
      }
    };

    /** Imatge fixa durant uns segons (títols i pauses amb dibuix). */
    const hold = async (seconds: number) => {
      const step = 0.5;
      for (let t = 0; t < seconds - 1e-6; t += step) await vSrc.add(cursor + t, Math.min(step, seconds - t));
      await silence(seconds);
      cursor += seconds;
      progress();
    };

    await document.fonts.load(`700 60px ${o.font}`).catch(() => undefined);
    const [crestUs, crestRival] = await Promise.all([
      o.crests?.us ? loadImage(o.crests.us) : Promise.resolve(null),
      o.crests?.rival ? loadImage(o.crests.rival) : Promise.resolve(null),
    ]);
    const crests = { us: crestUs, rival: crestRival };

    if (o.intro) {
      drawCard(ctx, W, H, o.font, crests, o.intro.title, o.intro.sub, "#dbb34d", true);
      await hold(CARD_S);
    }

    for (const sec of sections) {
      check();
      if (o.cards) {
        drawCard(ctx, W, H, o.font, crests, sec.title, sec.sub, sec.color, false);
        await hold(CARD_S);
      }
      for (const clip of sec.clips) {
        check();
        const base = cursor;
        const freezeAt = o.drawings && clip.drawing?.length && clip.drawAt != null ? clip.drawAt : null;
        let frozen = false;
        let shift = 0; // segons afegits per la pausa
        let last = clip.start;
        for await (const f of frames.canvases(clip.start, clip.end)) {
          check();
          if (f.timestamp + f.duration <= clip.start) continue;
          const t = Math.max(f.timestamp, clip.start);
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, W, H);
          ctx.drawImage(f.canvas, 0, 0, W, H);
          if (o.overlay) drawLabel(ctx, W, H, o.font, clip, clip.team ? crests[clip.team] : null);
          if (freezeAt != null && !frozen && t >= freezeAt) {
            // Pausa amb el dibuix (com a l'app), i després continua.
            drawShapes(ctx, W, H, clip.drawing!);
            frozen = true;
            cursor = base + (t - clip.start) + shift;
            const step = 0.5;
            for (let s = 0; s < FREEZE_S - 1e-6; s += step) await vSrc.add(cursor + s, step);
            shift += FREEZE_S;
            continue;
          }
          const ts = base + (t - clip.start) + shift;
          const dur = Math.min(f.timestamp + f.duration, clip.end) - t;
          if (dur > 0) await vSrc.add(ts, dur);
          last = t + dur;
          cursor = ts;
          o.onProgress?.(Math.min(1, ts / total));
        }
        const clipLen = Math.max(0, last - clip.start);
        // Àudio del tall, retallat exactament al tros i amb el mateix desplaçament per la pausa.
        if (audio && aSrc) {
          const clipEnd = clip.start + clipLen;
          const pausedAt = freezeAt != null && frozen ? freezeAt : null;
          let pausedAdded = false;
          for await (const smp of audio.samples(clip.start, clipEnd)) {
            check();
            const lo = Math.max(smp.timestamp, clip.start);
            const hi = Math.min(smp.timestamp + smp.duration, clipEnd);
            const parts: [number, number][] =
              hi <= lo ? [] : pausedAt != null && pausedAt > lo && pausedAt < hi ? [[lo, pausedAt], [pausedAt, hi]] : [[lo, hi]];
            for (const [p0, p1] of parts) {
              const f0 = Math.max(0, Math.round((p0 - smp.timestamp) * smp.sampleRate));
              const f1 = Math.min(smp.numberOfFrames, Math.round((p1 - smp.timestamp) * smp.sampleRate));
              if (f1 <= f0) continue;
              const after = pausedAt != null && p0 >= pausedAt;
              if (after && !pausedAdded) {
                const save = cursor;
                cursor = base + (pausedAt - clip.start);
                await silence(FREEZE_S);
                cursor = save;
                pausedAdded = true;
              }
              const piece = smp.trim(f0, f1);
              piece.setTimestamp(base + (p0 - clip.start) + (after ? FREEZE_S : 0));
              await aSrc.add(piece);
              piece.close();
            }
            smp.close();
          }
          if (pausedAt != null && !pausedAdded) {
            // la pausa queda al final del tall (sense àudio després)
            const save = cursor;
            cursor = base + (pausedAt - clip.start);
            await silence(FREEZE_S);
            cursor = save;
          }
        }
        cursor = base + clipLen + shift;
        progress();
      }
    }

    await output.finalize();
    const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buf) throw new ExportError("No s'ha pogut crear el vídeo.");
    return new Blob([buf], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}

// ---------------------------------------------------------------------------
// Dibuix sobre el vídeo
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, font: string, weight = 400) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${font}`;
    s -= 2;
  } while (ctx.measureText(text).width > max && s > 10);
}

/** Pantalla de títol (inici d'apartat). */
type Crests = { us: HTMLImageElement | null; rival: HTMLImageElement | null };

/** Dibuixa un escut dins d'un quadrat (sense deformar-lo). */
function drawCrest(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, size: number) {
  const k = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.4)";
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.04;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

/** Pantalla de títol: inicial (escuts grans, un contra l'altre) o d'apartat (escuts més petits). */
function drawCard(ctx: CanvasRenderingContext2D, W: number, H: number, font: string, crests: Crests, title: string, sub: string, color: string, intro: boolean) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0b1846");
  g.addColorStop(1, "#0a2ea0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.fillRect(0, H * 0.62, W, H * 0.012);
  const size = H * (intro ? 0.26 : 0.18);
  const cy = H * (intro ? 0.24 : 0.2);
  const both = crests.us && crests.rival;
  if (both) {
    const gap = size * (intro ? 0.95 : 0.85);
    drawCrest(ctx, crests.us!, W / 2 - gap, cy, size);
    drawCrest(ctx, crests.rival!, W / 2 + gap, cy, size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#dbb34d";
    ctx.font = `400 ${Math.round(size * 0.32)}px ${font}`;
    ctx.fillText("VS", W / 2, cy);
  } else if (crests.us || crests.rival) {
    drawCrest(ctx, (crests.us ?? crests.rival)!, W / 2, cy, size);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  fitText(ctx, title.toUpperCase(), W * 0.86, Math.round(H * 0.16), font);
  ctx.fillText(title.toUpperCase(), W / 2, H * 0.56);
  ctx.fillStyle = "#dbb34d";
  fitText(ctx, sub.toUpperCase(), W * 0.86, Math.round(H * 0.065), font);
  ctx.fillText(sub.toUpperCase(), W / 2, H * 0.74);
}

/** Etiqueta a sobre del vídeo: acció i minut (i jugadora). */
function drawLabel(ctx: CanvasRenderingContext2D, W: number, H: number, font: string, c: Clip, crest: HTMLImageElement | null) {
  const pad = Math.round(H * 0.022);
  const size = Math.round(H * 0.05);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `400 ${size}px ${font}`;
  const main = c.label.toUpperCase();
  const wMain = ctx.measureText(main).width;
  ctx.font = `400 ${Math.round(size * 0.7)}px ${font}`;
  const sub = (c.sub ?? "").toUpperCase();
  const wSub = sub ? ctx.measureText(sub).width : 0;
  const boxH = size * 1.3 + (sub ? size * 0.9 : 0);
  const cw = crest ? boxH * 0.78 + pad * 0.6 : 0; // lloc per a l'escut de l'equip
  const boxW = Math.max(wMain, wSub) + pad * 2 + size * 0.4 + cw;
  const x = pad, y = pad;
  ctx.fillStyle = "rgba(11,24,70,.82)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = c.color;
  ctx.fillRect(x, y, size * 0.22, boxH);
  if (crest) {
    const cs = boxH * 0.78;
    const k = Math.min(cs / crest.naturalWidth, cs / crest.naturalHeight);
    const w = crest.naturalWidth * k, h = crest.naturalHeight * k;
    const cx = x + size * 0.22 + pad * 0.6 + cs / 2;
    ctx.drawImage(crest, cx - w / 2, y + boxH / 2 - h / 2, w, h);
  }
  const tx = x + pad + size * 0.2 + cw;
  ctx.fillStyle = "#fff";
  ctx.font = `400 ${size}px ${font}`;
  ctx.fillText(main, tx, y + size * 0.68);
  if (sub) {
    ctx.fillStyle = "#dbb34d";
    ctx.font = `400 ${Math.round(size * 0.7)}px ${font}`;
    ctx.fillText(sub, tx, y + size * 1.25 + size * 0.3);
  }
}

/** El dibuix desat (coordenades 0-100) a sobre del vídeo. */
function drawShapes(ctx: CanvasRenderingContext2D, W: number, H: number, shapes: Shape[]) {
  const P = (p: [number, number]) => [(p[0] / 100) * W, (p[1] / 100) * H] as const;
  const lw = Math.max(3, H * 0.007);
  for (const s of shapes) {
    const a = P(s.pts[0]);
    const b = P(s.pts[s.pts.length - 1]);
    ctx.save();
    ctx.strokeStyle = s.c;
    ctx.fillStyle = s.c;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (s.k === "arrow" || s.k === "line") {
      if (s.k === "line") ctx.setLineDash([lw * 2.5, lw * 2]);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      if (s.k === "arrow") {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const L = lw * 4.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(b[0] + Math.cos(ang) * lw, b[1] + Math.sin(ang) * lw);
        ctx.lineTo(b[0] - Math.cos(ang - 0.45) * L, b[1] - Math.sin(ang - 0.45) * L);
        ctx.lineTo(b[0] - Math.cos(ang + 0.45) * L, b[1] - Math.sin(ang + 0.45) * L);
        ctx.closePath();
        ctx.fill();
      }
    } else if (s.k === "circle") {
      ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.k === "rect") {
      ctx.globalAlpha = 0.22;
      ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      ctx.globalAlpha = 1;
      ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    } else {
      s.pts.forEach((p, i) => {
        const q = P(p);
        if (i) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
      });
      ctx.stroke();
    }
    ctx.restore();
  }
}
