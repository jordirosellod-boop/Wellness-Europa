// PDF de diverses pàgines A4 a partir d'un element: es parteix entre blocs (.rr-block) perquè cap quedi tallat.

export async function reportPdf(el: HTMLElement, fileName: string): Promise<File> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  el.classList.add("pdf-mode");
  document.documentElement.classList.add("pdf-capture"); // els PDF sempre en clar, encara que el mòbil vagi en mode fosc
  let canvas: HTMLCanvasElement;
  let cuts: number[];
  try {
    const w0 = el.offsetWidth, h0 = el.offsetHeight;
    const ratio = Math.min(2.5, Math.sqrt(24_000_000 / (w0 * h0)));
    const top0 = el.getBoundingClientRect().top;
    // On comença cada bloc (on es pot tallar la pàgina)
    cuts = [...el.querySelectorAll<HTMLElement>(".rr-block")].map((b) => (b.getBoundingClientRect().top - top0) * ratio);
    canvas = await toCanvas(el, {
      pixelRatio: ratio, backgroundColor: "#ffffff", width: w0, height: h0,
      filter: (n) => !(n instanceof HTMLElement && n.classList.contains("no-print")),
    });
  } finally {
    el.classList.remove("pdf-mode");
    document.documentElement.classList.remove("pdf-capture");
  }
  const M = 10, PW = 210 - 2 * M, PH = 297 - 2 * M;
  const pageH = Math.floor(canvas.width * (PH / PW)); // alçada d'una pàgina en píxels del dibuix
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  let y = 0, first = true;
  while (y < canvas.height - 2) {
    let end = Math.min(canvas.height, y + pageH);
    if (end < canvas.height) {
      // talla just abans del bloc que no hi cap sencer (si n'hi ha cap que comenci dins la pàgina)
      const cut = cuts.filter((c) => c > y + pageH * 0.3 && c <= end).pop();
      if (cut) end = Math.floor(cut);
    }
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = end - y;
    const ctx = part.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", M, M, PW, (end - y) * (PW / canvas.width));
    y = end;
  }
  return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
}
