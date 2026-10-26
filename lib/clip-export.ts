// Talls de vídeo fets al mateix dispositiu (el vídeo no es puja enlloc).
// Es llegeix el fitxer del partit, es tallen els trossos de cada acció, s'hi posa el títol de cada apartat
// i el nom de l'acció a sobre, i es fa un MP4 nou. Fa servir el xip de vídeo del dispositiu (WebCodecs).

import type { Shape } from "@/components/telestrator";
import type { RivalSummary } from "@/lib/rival-summary";

/** Fitxa del rival (pantalles a l'inici del vídeo amb tots els talls). Els noms ja venen arreglats. */
export type RivalCard = {
  s: RivalSummary;
  name: string;
  crest: string | null; // adreça de l'escut (de l'app)
  last: { label: string; score: string; res: "G" | "E" | "P" }[];
  scorers: { name: string; goals: number }[];
  scout?: { system: string; strengths: string; weaknesses: string; keys: string; players: string[] } | null;
};

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
  rival?: RivalCard | null; // fitxa del rival (només amb la pantalla inicial)
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

const CARD_S = 2.5;
const RIVAL_S = 7; // cada pantalla de la fitxa del rival (temps per llegir-la)
const FREEZE_S = 3;
const MAX_W = 1280;
const MAX_H = 720;

export class ExportError extends Error {}

/** Durada total aproximada (per mostrar-la abans de començar). */
export function totalSeconds(sections: Section[], o: Pick<ExportOptions, "cards" | "drawings" | "intro" | "rival">) {
  let t = o.intro ? CARD_S + (o.rival ? rivalPages(o.rival) * RIVAL_S : 0) : 0;
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
      if (o.rival) {
        const img = o.rival.crest ? await loadImage(o.rival.crest) : null;
        for (let page = 0; page < rivalPages(o.rival); page++) {
          check();
          drawRival(ctx, W, H, o.font, o.rival, img, page);
          await hold(RIVAL_S);
        }
      }
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

// ---------------------------------------------------------------------------
// Fitxa del rival
// ---------------------------------------------------------------------------

const RES_COLOR = { G: "#1e9e4a", E: "#9aa3bd", P: "#d32f2f" } as const;
const hasScout = (r: RivalCard) => !!r.scout && !!(r.scout.system || r.scout.strengths || r.scout.weaknesses || r.scout.keys || r.scout.players.length);
export const rivalPages = (r: RivalCard) => (hasScout(r) ? 3 : 2);

/** Text en diverses línies (com a molt `maxLines`; l'última amb «…» si no hi cap). */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  let line = "", n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (n === maxLines - 1) {
        let cut = line;
        while (cut && ctx.measureText(`${cut}…`).width > maxW) cut = cut.slice(0, -1);
        ctx.fillText(`${cut}…`, x, y + n * lineH);
        return n + 1;
      }
      ctx.fillText(line, x, y + n * lineH);
      n++;
      line = words[i];
    } else line = test;
  }
  if (line) {
    ctx.fillText(line, x, y + n * lineH);
    n++;
  }
  return n;
}

function rivalBg(ctx: CanvasRenderingContext2D, W: number, H: number, font: string, title: string, r: RivalCard, img: HTMLImageElement | null) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0b1846");
  g.addColorStop(1, "#13307d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#dbb34d";
  ctx.fillRect(0, 0, W, H * 0.012);
  const pad = W * 0.05;
  const cs = H * 0.13;
  if (img) drawCrest(ctx, img, pad + cs / 2, H * 0.1, cs);
  const tx = img ? pad + cs + W * 0.02 : pad;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#dbb34d";
  ctx.font = `400 ${Math.round(H * 0.038)}px ${font}`;
  ctx.fillText(title.toUpperCase(), tx, H * 0.065);
  ctx.fillStyle = "#fff";
  fitText(ctx, r.name.toUpperCase(), W - tx - pad, Math.round(H * 0.075), font);
  ctx.fillText(r.name.toUpperCase(), tx, H * 0.13);
  return pad;
}

function statBox(ctx: CanvasRenderingContext2D, font: string, x: number, y: number, w: number, h: number, value: string, label: string, color = "#fff") {
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fillRect(x, y, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  fitText(ctx, value, w * 0.9, Math.round(h * 0.5), font);
  ctx.fillText(value, x + w / 2, y + h * 0.42);
  ctx.fillStyle = "#b9c3e0";
  ctx.font = `400 ${Math.round(h * 0.17)}px ${font}`;
  ctx.fillText(label.toUpperCase(), x + w / 2, y + h * 0.8);
}

function badge(ctx: CanvasRenderingContext2D, font: string, x: number, y: number, size: number, res: "G" | "E" | "P") {
  ctx.fillStyle = RES_COLOR[res];
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.18);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `400 ${Math.round(size * 0.6)}px ${font}`;
  ctx.fillText(res, x + size / 2, y + size * 0.54);
}

function drawRival(ctx: CanvasRenderingContext2D, W: number, H: number, font: string, r: RivalCard, img: HTMLImageElement | null, page: number) {
  const s = r.s;
  if (page === 0) {
    const pad = rivalBg(ctx, W, H, font, "Fitxa del rival · com van a la lliga", r, img);
    const top = H * 0.25, bw = (W - pad * 2 - W * 0.03 * 3) / 4, bh = H * 0.2;
    statBox(ctx, font, pad, top, bw, bh, s.pos ? `${s.pos}a` : "–", `de ${s.teams} equips`, "#dbb34d");
    statBox(ctx, font, pad + (bw + W * 0.03), top, bw, bh, String(s.pts), `punts · ${s.pj} PJ`);
    statBox(ctx, font, pad + (bw + W * 0.03) * 2, top, bw, bh, `${s.g}-${s.e}-${s.p}`, "guanyats-empats-perduts");
    statBox(ctx, font, pad + (bw + W * 0.03) * 3, top, bw, bh, `${s.gf}:${s.gc}`, "gols a favor : en contra");
    const y2 = top + bh + H * 0.06;
    const bw2 = (W - pad * 2 - W * 0.03 * 2) / 3, bh2 = H * 0.16;
    const pm = (n: number) => (s.pj ? (n / s.pj).toFixed(1).replace(".", ",") : "–");
    statBox(ctx, font, pad, y2, bw2, bh2, pm(s.gf), "gols marcats per partit");
    statBox(ctx, font, pad + bw2 + W * 0.03, y2, bw2, bh2, pm(s.gc), "gols encaixats per partit");
    statBox(ctx, font, pad + (bw2 + W * 0.03) * 2, y2, bw2, bh2, String(s.clean_sheets), "porteria a zero");
    // Ratxa i casa/fora
    const y3 = y2 + bh2 + H * 0.07;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#dbb34d";
    ctx.font = `400 ${Math.round(H * 0.045)}px ${font}`;
    ctx.fillText("RATXA", pad, y3);
    const bs = H * 0.065;
    let bx = pad + ctx.measureText("RATXA").width + W * 0.02;
    if (s.form.length) for (const f of s.form) { badge(ctx, font, bx, y3 - bs / 2, bs, f); bx += bs * 1.2; }
    else { ctx.fillStyle = "#b9c3e0"; ctx.fillText("encara sense partits", bx, y3); }
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = `400 ${Math.round(H * 0.042)}px ${font}`;
    ctx.fillText(`A CASA ${s.home.g}-${s.home.e}-${s.home.p}  ·  A FORA ${s.away.g}-${s.away.e}-${s.away.p}`, W - pad, y3);
    if (s.stale_at) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#b9c3e0";
      ctx.font = `400 ${Math.round(H * 0.028)}px ${font}`;
      ctx.fillText("DADES DE LA FCF GUARDADES I COMPLETADES AMB LES ACTES", W / 2, H * 0.95);
    }
    return;
  }
  if (page === 1) {
    const pad = rivalBg(ctx, W, H, font, "Últims partits i jugadores top", r, img);
    const colW = (W - pad * 2 - W * 0.04) / 2;
    const top = H * 0.25;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#dbb34d";
    ctx.font = `400 ${Math.round(H * 0.045)}px ${font}`;
    ctx.fillText("ÚLTIMS PARTITS", pad, top);
    const rowH = H * 0.11, bs = H * 0.07;
    if (!r.last.length) { ctx.fillStyle = "#b9c3e0"; ctx.fillText("Encara no ha jugat", pad, top + rowH); }
    r.last.slice(0, 5).forEach((g, i) => {
      const y = top + rowH * (i + 0.85);
      badge(ctx, font, pad, y - bs / 2, bs, g.res);
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.font = `400 ${Math.round(H * 0.05)}px ${font}`;
      ctx.fillText(g.score, pad + bs * 1.3, y);
      const sw = ctx.measureText("00-00 ").width;
      ctx.fillStyle = "#dfe5f5";
      fitText(ctx, g.label.toUpperCase(), colW - bs * 1.3 - sw, Math.round(H * 0.036), font);
      ctx.fillText(g.label.toUpperCase(), pad + bs * 1.3 + sw, y);
    });
    const x2 = pad + colW + W * 0.04;
    ctx.textAlign = "left";
    ctx.fillStyle = "#dbb34d";
    ctx.font = `400 ${Math.round(H * 0.045)}px ${font}`;
    ctx.fillText("GOLEJADORES", x2, top);
    if (!r.scorers.length) { ctx.fillStyle = "#b9c3e0"; ctx.fillText("Encara cap gol", x2, top + rowH); }
    const max = Math.max(1, ...r.scorers.map((p) => p.goals));
    r.scorers.slice(0, 4).forEach((p, i) => {
      const y = top + rowH * (i + 0.85);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      fitText(ctx, p.name.toUpperCase(), colW * 0.62, Math.round(H * 0.042), font);
      ctx.fillText(p.name.toUpperCase(), x2, y);
      const bx = x2 + colW * 0.64, bwMax = colW * 0.26;
      ctx.fillStyle = i === 0 ? "#dbb34d" : "#5f79c9";
      ctx.fillRect(bx, y - H * 0.018, Math.max(H * 0.02, (bwMax * p.goals) / max), H * 0.036);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "right";
      ctx.font = `400 ${Math.round(H * 0.045)}px ${font}`;
      ctx.fillText(String(p.goals), x2 + colW, y);
    });
    if (s.team_goals_by_top >= 30 && r.scorers[0]) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#dbb34d";
      ctx.font = `400 ${Math.round(H * 0.034)}px ${font}`;
      wrap(ctx, `ULL: ${r.scorers[0].name.toUpperCase()} FA EL ${s.team_goals_by_top}% DELS GOLS DE L'EQUIP`, x2, top + rowH * 5.1, colW, H * 0.045, 2);
    }
    return;
  }
  // Pàgina 3: claus de l'informe del rival
  const pad = rivalBg(ctx, W, H, font, "Claus del rival · informe", r, img);
  const sc = r.scout!;
  let y = H * 0.25;
  const block = (title: string, text: string, lines: number) => {
    if (!text.trim()) return;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#dbb34d";
    ctx.font = `400 ${Math.round(H * 0.036)}px ${font}`;
    ctx.fillText(title.toUpperCase(), pad, y);
    ctx.fillStyle = "#fff";
    ctx.font = `400 ${Math.round(H * 0.036)}px ${font}`;
    const n = wrap(ctx, text, pad, y + H * 0.05, W - pad * 2, H * 0.045, lines);
    y += H * 0.05 + n * H * 0.045 + H * 0.025;
  };
  // (com a molt 7 línies de text perquè hi càpiga tot)
  block("Sistema", sc.system, 1);
  block("Punts forts", sc.strengths, 2);
  block("Punts febles", sc.weaknesses, 2);
  if (sc.players.length) block("Jugadores clau", sc.players.join(" · "), 1);
  block("Claus del partit", sc.keys, 1);
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
