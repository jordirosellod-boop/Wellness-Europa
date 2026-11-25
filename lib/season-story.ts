// «La meva temporada» com a imatge per a Instagram (1080×1920): les xifres grans amb l'estètica del club.

import { escapulat, family, img, toBlob } from "@/lib/convo-story";
import type { SeasonWrap } from "@/lib/season-wrap";

export async function drawSeasonStory(w: SeasonWrap, name: string): Promise<Blob> {
  const W = 1080, H = 1920;
  const ESC = family("--font-escapulada", "Impact, sans-serif");
  await document.fonts.load(`100px ${ESC}`).catch(() => {});
  const crest = await img("/escut.png");
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#071a52"); g.addColorStop(1, "#020818"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const sp = x.createRadialGradient(W * 0.5, 380, 40, W * 0.5, 380, 900); sp.addColorStop(0, "rgba(219,179,77,.25)"); sp.addColorStop(1, "rgba(219,179,77,0)"); x.fillStyle = sp; x.fillRect(0, 0, W, H);
  escapulat(x, true, { x: 0, y: 0, w: W }, "rgba(255,255,255,.05)");
  const bar = x.createLinearGradient(0, 0, W, 0); bar.addColorStop(0, "#dbb34d"); bar.addColorStop(.5, "#f6d77a"); bar.addColorStop(1, "#dbb34d"); x.fillStyle = bar; x.fillRect(0, 0, W, 14);
  x.save(); x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 40; x.drawImage(crest, W / 2 - 110, 150, 220, 220); x.restore();
  x.textAlign = "center"; x.fillStyle = "#dbb34d"; x.font = `40px ${ESC}`; x.letterSpacing = "10px"; x.fillText(`TEMPORADA ${w.season}`, W / 2, 450); x.letterSpacing = "0px";
  const first = name.trim().split(/\s+/)[0].toUpperCase();
  x.fillStyle = "#fff"; let s = 150; do { x.font = `${s}px ${ESC}`; s -= 6; } while (x.measureText(`LA TEMPORADA DE ${first}`).width > W - 120 && s > 60);
  x.fillText("LA TEMPORADA", W / 2, 600); x.fillStyle = "#f6d77a"; x.fillText(`DE ${first}`, W / 2, 600 + s * 0.95);
  const tiles: [string, string][] = [
    [w.trainings.marked ? `${Math.round((w.trainings.present / w.trainings.marked) * 100)}%` : "–", "ENTRENAMENTS"],
    [String(w.matches.minutes), "MINUTS JUGATS"],
    [String(w.matches.goals), w.matches.goals === 1 ? "GOL" : "GOLS"],
    [String(w.wellness.best), "MILLOR RATXA"],
    [String(w.wellness.count), "WELLNESS"],
    [String(w.mvps), w.mvps === 1 ? "COP MVP" : "COPS MVP"],
  ];
  const tw = 440, th = 230, gx = 40, y0 = 900;
  tiles.forEach(([v, l], i) => {
    const cx = W / 2 + (i % 2 ? gx / 2 : -tw - gx / 2), cy = y0 + Math.floor(i / 2) * (th + 36);
    x.fillStyle = "rgba(255,255,255,.07)"; x.beginPath(); x.roundRect(cx, cy, tw, th, 30); x.fill();
    x.strokeStyle = "rgba(219,179,77,.4)"; x.lineWidth = 3; x.stroke();
    x.fillStyle = "#f6d77a"; x.font = `120px ${ESC}`; x.fillText(v, cx + tw / 2, cy + 140);
    x.fillStyle = "#d8e1ff"; x.font = `34px ${ESC}`; x.letterSpacing = "4px"; x.fillText(l, cx + tw / 2, cy + 196); x.letterSpacing = "0px";
  });
  x.fillStyle = "rgba(255,255,255,.75)"; x.font = `34px ${ESC}`; x.letterSpacing = "8px"; x.fillText("CE EUROPA · JUVENIL C", W / 2, H - 90); x.letterSpacing = "0px";
  return toBlob(cv);
}
