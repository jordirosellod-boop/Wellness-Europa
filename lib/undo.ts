// «Esborrat · Desfer»: l'element desapareix de seguida, però no s'esborra de debò fins al cap de 5 segons.
// Si en aquests segons es toca «Desfer», torna. Si es surt de l'app, s'esborra en aquell moment.

export type Undoable = { id: number; text: string; undo: () => void };
type Pending = Undoable & { commit: () => void; timer: ReturnType<typeof setTimeout> };

let cur: Pending | null = null;
let seq = 0;
const subs = new Set<(u: Undoable | null) => void>();
const emit = () => subs.forEach((f) => f(cur && { id: cur.id, text: cur.text, undo: cur.undo }));

export function onUndo(f: (u: Undoable | null) => void) {
  subs.add(f);
  f(cur);
  return () => { subs.delete(f); };
}

function commitNow() {
  if (!cur) return;
  const p = cur;
  cur = null;
  clearTimeout(p.timer);
  p.commit();
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", commitNow);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && commitNow());
}

/**
 * `hide`: el treu de la pantalla ara. `restore`: el torna a posar (si es desfà).
 * `commit`: l'esborra de debò (al cap de 5 segons).
 */
export function deleteWithUndo(text: string, o: { hide: () => void; restore: () => void; commit: () => void | Promise<void> }, ms = 5000) {
  commitNow(); // el que hi hagués pendent s'esborra ja
  o.hide();
  const id = ++seq;
  const p: Pending = {
    id, text,
    undo: () => {
      if (cur?.id !== id) return;
      clearTimeout(p.timer);
      cur = null;
      o.restore();
      emit();
    },
    commit: () => { void o.commit(); },
    timer: setTimeout(() => cur?.id === id && commitNow(), ms),
  };
  cur = p;
  emit();
}
