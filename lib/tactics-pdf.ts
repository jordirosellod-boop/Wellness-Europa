// PDF del pla de partit: el text del pla i, per a cada escena, la imatge de l'inici i del final.

import { sceneLength, type BoardData } from "@/lib/tactics";
import { sceneImage, type RenderOpts } from "@/lib/tactics-render";

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export async function planPdf(title: string, sub: string, data: BoardData, o: RenderOpts): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const W = 297, H = 210, M = 12;
  const head = (t: string) => {
    pdf.setFillColor(11, 24, 70);
    pdf.rect(0, 0, W, 18, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text(t.toUpperCase(), M, 11.5);
    pdf.setTextColor(219, 179, 77);
    pdf.setFontSize(9);
    pdf.text(sub.toUpperCase(), W - M, 11.5, { align: "right" });
  };

  // 1) Pla de partit (text en dues columnes)
  if (data.plan?.length) {
    head(title);
    const colW = (W - 2 * M - 10) / 2;
    let col = 0, y = 28;
    for (const sec of data.plan) {
      const body = sec.lines.filter((l) => l.trim()).flatMap((l) => pdf.splitTextToSize(`•  ${l}`, colW) as string[]);
      const need = 8 + body.length * 4.6;
      if (y + need > H - M) {
        col++;
        y = 28;
        if (col > 1) {
          pdf.addPage();
          head(title);
          col = 0;
        }
      }
      const x = M + col * (colW + 10);
      pdf.setTextColor(10, 46, 160);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11.5);
      pdf.text(sec.title.toUpperCase(), x, y);
      pdf.setDrawColor(219, 179, 77);
      pdf.setLineWidth(0.6);
      pdf.line(x, y + 1.6, x + 30, y + 1.6);
      pdf.setTextColor(11, 24, 70);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.text(body, x, y + 7);
      y += need + 4;
    }
  }

  // 2) Escenes: inici i final
  for (const s of data.scenes) {
    if (data.plan?.length || s !== data.scenes[0]) pdf.addPage();
    head(s.title);
    const len = sceneLength(s);
    const shots = s.frames.length > 1 ? [0, len] : [0];
    const boxW = shots.length === 2 ? (W - 2 * M - 6) / 2 : W - 2 * M - 60;
    for (let i = 0; i < shots.length; i++) {
      const url = await blobToDataUrl(await sceneImage(s, shots[i], { ...o, title: undefined }));
      const img = new Image();
      img.src = url;
      await img.decode();
      const h = (boxW * img.naturalHeight) / img.naturalWidth;
      const maxH = H - 28 - 30;
      const k = Math.min(1, maxH / h);
      const x = shots.length === 2 ? M + i * (boxW + 6) : (W - boxW * k) / 2;
      pdf.addImage(url, "PNG", x, 24, boxW * k, h * k);
    }
    const notes = s.frames.map((f, i) => (f.note ? `${i + 1}. ${f.note}` : "")).filter(Boolean);
    if (notes.length) {
      pdf.setTextColor(11, 24, 70);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.text(pdf.splitTextToSize(notes.join("   ·   "), W - 2 * M) as string[], M, H - 22);
    }
  }
  return pdf.output("blob");
}
