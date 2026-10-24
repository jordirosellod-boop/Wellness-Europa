import { fmtDateTime } from "@/lib/wellness";

/** Avís quan la FCF no respon i es mostren les dades guardades. */
export function FcfStaleNote({ at }: { at: string | null | undefined }) {
  if (!at) return null;
  return (
    <p className="msg fcf-stale" role="status">
      ⚠️ La FCF ara mateix no deixa consultar les seves dades. Es mostren les guardades ({fmtDateTime(at)}), completades amb les actes dels partits ja jugats.
    </p>
  );
}
