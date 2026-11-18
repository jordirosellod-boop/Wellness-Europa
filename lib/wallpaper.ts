// Fons de pantalla del mòbil amb el cromo (1170 × 2532, la mida d'un iPhone; a Android s'ajusta sol).
// Dalt queda lliure per al rellotge de la pantalla de bloqueig.

import { escapulat, img, toBlob } from "@/lib/convo-story";

export async function drawWallpaper(cardStory: Blob, gold: boolean): Promise<Blob> {
  const W = 1170, H = 2532;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;
  const url = URL.createObjectURL(cardStory);
  try {
    const [card, crest] = await Promise.all([img(url), img("/escut.png")]);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#030a24"); g.addColorStop(0.45, "#071a52"); g.addColorStop(1, "#020716");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    escapulat(x, false, { x: 0, y: 0, w: W }, "rgba(255,255,255,.035)");
    // El cromo (la imatge de compartir, que ja porta el seu fons) fos amb el fons
    const cw = W, ch = Math.round(card.height * (W / card.width)), cy = Math.round(H * 0.36);
    x.drawImage(card, 0, cy, cw, ch);
    for (const [y0, y1, up] of [[cy, cy + 260, true], [cy + ch - 260, cy + ch, false]] as const) {
      const f = x.createLinearGradient(0, y0, 0, y1);
      f.addColorStop(up ? 0 : 1, "rgba(5,16,58,1)"); f.addColorStop(up ? 1 : 0, "rgba(5,16,58,0)");
      x.fillStyle = f; x.fillRect(0, y0, W, y1 - y0);
    }
    // Llum suau al voltant del cromo
    const sp = x.createRadialGradient(W / 2, cy + ch * 0.45, 40, W / 2, cy + ch * 0.45, 900);
    sp.addColorStop(0, gold ? "rgba(219,179,77,.16)" : "rgba(60,110,240,.18)"); sp.addColorStop(1, "rgba(0,0,0,0)");
    x.globalCompositeOperation = "screen"; x.fillStyle = sp; x.fillRect(0, 0, W, H); x.globalCompositeOperation = "source-over";
    // Escut a baix i una línia daurada
    x.globalAlpha = 0.9; x.drawImage(crest, W / 2 - 60, H - 250, 120, 120); x.globalAlpha = 1;
    const bar = x.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
    bar.addColorStop(0, "rgba(219,179,77,0)"); bar.addColorStop(0.5, "#f6d77a"); bar.addColorStop(1, "rgba(219,179,77,0)");
    x.fillStyle = bar; x.fillRect(W * 0.3, H - 100, W * 0.4, 3);
    return await toBlob(cv);
  } finally {
    URL.revokeObjectURL(url);
  }
}
