// Transicions entre pantalles amb la View Transitions API.

export type VtKind = "grow" | "slide" | "back" | "zoom";
type Vt = { finished: Promise<void> };

/** Sense suport o amb «menys moviment», canvia directament. */
export function transition(kind: VtKind, update: () => void, done?: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => Vt };
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    done?.();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = kind;
  doc.startViewTransition(update).finished.finally(() => {
    delete root.dataset.vt;
    done?.();
  });
}
