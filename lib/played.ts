// Quan un partit ja s'ha jugat: si la FCF l'ha tancat o si ja ha passat la seva hora.
// (La FCF de vegades triga a tancar l'acta: sense això, un partit ja jugat sortia com a «proper partit».)

const AFTER_MS = 3 * 3600 * 1000; // 3 h després de començar ja es dona per jugat

/** Mil·lisegons d'un «2026-11-14T19:30:00» (hora de Barcelona). */
function madridMs(kickoff: string): number {
  const [d, t = "00:00"] = kickoff.replace(" ", "T").split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh || 0, mm || 0);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return guess - (shown - guess);
}

export function isPlayed(m: { closed: boolean; kickoff: string | null }, now = Date.now()): boolean {
  if (m.closed) return true;
  if (!m.kickoff || !/^\d{4}-\d{2}-\d{2}/.test(m.kickoff)) return false;
  return madridMs(m.kickoff) + AFTER_MS < now;
}
