// Lliurar un fitxer fet al dispositiu: al mòbil/iPad, el menú de compartir (desar, imprimir, WhatsApp...);
// a l'ordinador, es descarrega.

export async function deliverFile(file: File) {
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

/** Si es pot compartir (cal un toc nou de l'usuari després de fer el fitxer). */
export const canShareFile = (file: File) => !!navigator.canShare?.({ files: [file] });

/** Nom de fitxer sense caràcters problemàtics. */
/** Nom de fitxer segur a tot arreu: sense accents ni símbols (alguns navegadors els rebutgen). */
export const safeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // treu els accents
    .replace(/[’']/g, "")
    .replace(/[·–—]/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/(\s+-+\s*|\s*-+\s+)+/g, " - ") // «a - - b» → «a - b» (sense tocar 2026-10-14)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
