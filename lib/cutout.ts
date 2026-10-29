// Retalla la jugadora del fons, al mateix navegador (la foto no surt del mòbil ni de l'ordinador).
// Fa servir MODNet (llicència Apache 2.0) amb transformers.js, que es carrega només quan cal.

const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
type Seg = (input: string) => Promise<unknown>;
let segPromise: Promise<Seg> | null = null;

async function segmenter(): Promise<Seg> {
  segPromise ??= (async () => {
    const t = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ LIB);
    return (await t.pipeline("background-removal", "Xenova/modnet")) as Seg;
  })().catch((e) => { segPromise = null; throw e; });
  return segPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("No s'ha pogut llegir la imatge."));
    im.src = src;
  });
}

/** Retalla la caixa on hi ha alguna cosa (alfa > 20) i hi deixa un petit marge. */
function trim(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error("No s'ha trobat cap jugadora a la foto.");
  const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.01);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(width - 1, x1 + m); y1 = Math.min(height - 1, y1 + m);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function scaled(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, maxH: number): HTMLCanvasElement {
  const k = Math.min(1, maxH / sh);
  const c = document.createElement("canvas");
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

const toData = (c: HTMLCanvasElement) => {
  const webp = c.toDataURL("image/webp", 0.86);
  return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
};

/** De la foto original treu: la jugadora sencera sense fons (fins a 900 px d'alt) i la petita, del cap a la cintura. */
export async function cutoutFromFile(file: File, onStep?: (s: string) => void): Promise<{ cutout: string; thumb: string }> {
  onStep?.("Preparant la foto…");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // Màxim 1600 px: prou qualitat i va ràpid.
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const base = document.createElement("canvas");
    base.width = Math.round(img.width * k); base.height = Math.round(img.height * k);
    base.getContext("2d")!.drawImage(img, 0, 0, base.width, base.height);
    onStep?.("Carregant l'eina per retallar (la primera vegada tarda una mica)…");
    const seg = await segmenter();
    onStep?.("Retallant el fons…");
    const res = await seg(base.toDataURL("image/jpeg", 0.92));
    const raw = (Array.isArray(res) ? res[0] : res) as { toCanvas: () => HTMLCanvasElement | OffscreenCanvas };
    const rc = raw.toCanvas();
    const c = document.createElement("canvas");
    c.width = rc.width; c.height = rc.height;
    c.getContext("2d")!.drawImage(rc as CanvasImageSource, 0, 0);
    const t = trim(c);
    const cutout = scaled(t, 0, 0, t.width, t.height, 900);
    const thumb = scaled(t, 0, 0, t.width, Math.round(t.height * 0.6), 420);
    return { cutout: toData(cutout), thumb: toData(thumb) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
