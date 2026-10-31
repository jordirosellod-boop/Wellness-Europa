// Fa el PDF de la plantilla al mateix dispositiu: una sola pàgina A4 horitzontal, sempre.
// (Imprimir des del navegador depèn de cada navegador: alguns, com Safari a l'iPhone, ignoren la mida
// de pàgina i el full surt tallat. Així el resultat és el mateix a tot arreu.)

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 8;
const MM = 96 / 25.4;

/** Fa el full prou ample perquè, un cop reduït, tingui la forma de la pàgina (menys alt). */
function shape(el: HTMLElement) {
  const boxW = (PAGE_W - 2 * MARGIN) * MM;
  const boxH = (PAGE_H - 2 * MARGIN) * MM;
  const ratio = (w: number) => {
    el.style.width = `${w}px`;
    return el.offsetHeight / w; // alt / ample
  };
  let w = boxW;
  // Si és més alt que la pàgina, s'eixampla fins que la proporció hi encaixi (el text ocupa menys línies).
  for (let i = 0; i < 12 && ratio(w) > boxH / boxW && w < boxW * 4; i++) w *= 1.12;
  ratio(w);
}

export async function planPdf(el: HTMLElement, fileName: string): Promise<File> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const oldWidth = el.style.width;
  // Visible però fora de la pantalla: si no, la còpia dels fills també quedaria amagada.
  el.style.visibility = "visible";
  shape(el);
  try {
    await document.fonts.ready;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Prou resolució per imprimir, sense passar el límit de mida de les imatges dels mòbils.
    const ratio = Math.min(3, Math.sqrt(14_000_000 / (w * h)));
    const canvas = await toCanvas(el, {
      pixelRatio: ratio,
      backgroundColor: "#ffffff",
      width: w,
      height: h,
      style: { position: "static", left: "0", top: "0", visibility: "visible", margin: "0", transform: "none" },
    });
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const boxW = PAGE_W - 2 * MARGIN;
    const boxH = PAGE_H - 2 * MARGIN;
    const k = Math.min(boxW / w, boxH / h);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN + (boxW - w * k) / 2, MARGIN, w * k, h * k);
    return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
  } finally {
    el.style.width = oldWidth;
    el.style.visibility = "";
  }
}

export { deliverFile as deliverPdf } from "@/lib/share-file";

/** PDF d'una sola pàgina A4 vertical amb l'element tal com es veu (p. ex. l'onze inicial). Deixa fora el que porta «no-print». */
export async function sheetPdf(el: HTMLElement, fileName: string): Promise<File> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  // «pdf-mode»: el full es mostra com en paper (capçalera visible, sense les ajudes de la pantalla)
  el.classList.add("pdf-mode");
  let canvas: HTMLCanvasElement;
  try {
    const w0 = el.offsetWidth, h0 = el.offsetHeight;
    canvas = await toCanvas(el, {
      pixelRatio: Math.min(3, Math.sqrt(14_000_000 / (w0 * h0))), backgroundColor: "#ffffff", width: w0, height: h0,
      filter: (n) => !(n instanceof HTMLElement && n.classList.contains("no-print")),
    });
  } finally {
    el.classList.remove("pdf-mode");
  }
  const w = canvas.width, h = canvas.height;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const boxW = PAGE_H - 2 * MARGIN, boxH = PAGE_W - 2 * MARGIN; // A4 vertical: 210 × 297
  const k = Math.min(boxW / w, boxH / h);
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN + (boxW - w * k) / 2, MARGIN, w * k, h * k);
  return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
}
