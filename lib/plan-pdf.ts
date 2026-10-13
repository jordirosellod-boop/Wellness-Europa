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
      style: { position: "static", left: "0", top: "0", visibility: "visible", margin: "0" },
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

/** Comparteix el PDF (mòbil: imprimir, desar, WhatsApp...) o el descarrega (ordinador). */
export async function deliverPdf(file: File) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // l'ha tancat
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
