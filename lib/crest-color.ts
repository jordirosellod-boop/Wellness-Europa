// El color principal d'un escut (per donar un toc suau del rival a la targeta del partit).
// Els escuts es serveixen des de la nostra pròpia adreça, així que es poden llegir en un canvas.

const cache = new Map<string, Promise<string | null>>();

/** «r g b» del color més present i viu de l'escut, o null si és tot blanc/negre/gris. */
export function crestColor(src: string): Promise<string | null> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise<string | null>((res) => {
      const im = new Image();
      im.onload = () => {
        try {
          const N = 40, c = document.createElement("canvas");
          c.width = c.height = N;
          const x = c.getContext("2d", { willReadFrequently: true })!;
          x.drawImage(im, 0, 0, N, N);
          const d = x.getImageData(0, 0, N, N).data;
          const bins = Array.from({ length: 18 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 200) continue;
            const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, ch = mx - mn;
            if (ch < 0.18 || l < 0.12 || l > 0.9) continue; // blancs, negres i grisos fora
            let h = mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4;
            h = (h * 60 + 360) % 360;
            // El blau és el nostre: si l'escut té un altre color, preferim aquell
            const bin = bins[Math.floor(h / 20)], w = ch * (h >= 190 && h <= 250 ? 0.3 : 1);
            bin.w += w; bin.r += d[i] * w; bin.g += d[i + 1] * w; bin.b += d[i + 2] * w;
          }
          const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
          // Massa poc color: no hi posem res
          if (best.w < N * N * 0.03) return res(null);
          res(`${Math.round(best.r / best.w)} ${Math.round(best.g / best.w)} ${Math.round(best.b / best.w)}`);
        } catch { res(null); }
      };
      im.onerror = () => res(null);
      im.src = src;
    });
    cache.set(src, p);
  }
  return p;
}
