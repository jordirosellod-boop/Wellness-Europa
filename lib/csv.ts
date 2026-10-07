import { alertsOf, bandOf, fmtDateTime, fmtSessionTime, type Profile, type Rpe, type Session, type Wellness } from "./wellness";

// CSV pensat per obrir-se amb doble clic a l'Excel en català/castellà:
// separador ";" , decimals amb coma i BOM perquè els accents surtin bé.

function cell(v: string | number | null | undefined): string {
  let s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
  // Evita que un text que comenci per = + - @ s'executi com a fórmula a l'Excel.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sessionCsv(
  session: Session,
  rows: { player: Profile; w: Wellness | null; r: Rpe | null }[],
): string {
  const header = [
    "Jugadora", "Data", "Hora sessió", "Tipus", "Sessió",
    "Son", "Fatiga", "Ànim", "Wellness", "Banda", "Alertes", "Molèstia", "Notes wellness", "Enviat wellness",
    "RPE", "Notes RPE", "Enviat RPE",
  ];
  const lines = rows.map(({ player, w, r }) => [
    player.display_name, session.session_date, fmtSessionTime(session.start_time), session.kind, session.name,
    w?.sleep, w?.fatigue, w?.mood, w ? Number(w.score).toFixed(1).replace(".", ",") : "PENDENT", w ? bandOf(Number(w.score)).label : "",
    w ? alertsOf(w).map((a) => `${a.label} (${a.value})`).join(", ") : "",
    w?.has_pain ? w.pain_description : "", w?.notes, w ? fmtDateTime(w.submitted_at) : "",
    r ? r.rpe : "PENDENT", r?.notes, r ? fmtDateTime(r.submitted_at) : "",
  ]);
  return "﻿" + [header, ...lines].map((l) => l.map(cell).join(";")).join("\r\n") + "\r\n";
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
