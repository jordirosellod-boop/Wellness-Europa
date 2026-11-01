import { hhmm, KITS, kitOf } from "@/lib/convo";
import { addDays } from "@/lib/dates";
import { adminClient } from "@/lib/server-admin";
import { fetchAll } from "@/lib/supabase";
import { todayMadrid } from "@/lib/wellness";

// Calendari per subscriure's des del mòbil (iPhone, Google…): els entrenos i els partits de l'equip.
// S'hi accedeix amb l'enllaç secret de cada persona (my_calendar_token). No hi surt cap nom.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("No trobat", { status: 404 });
  const db = adminClient();
  const { data: who } = await db.from("calendar_tokens").select("profile_id").eq("token", token).maybeSingle();
  if (!who) return new Response("No trobat", { status: 404 });

  const today = todayMadrid();
  const from = addDays(today, -60), to = addDays(today, 240);
  const [sessions, convos] = await Promise.all([
    fetchAll<{ id: string; session_date: string; start_time: string | null; kind: string; name: string; duration_min: number | null; cancelled: boolean }>((f, t) =>
      db.from("sessions").select("id, session_date, start_time, kind, name, duration_min, cancelled").gte("session_date", from).lte("session_date", to).order("session_date").order("id").range(f, t)),
    fetchAll<{ id: string; match_date: string; kickoff: string | null; meet_time: string | null; rival: string; is_home: boolean; competition: string | null; venue: string | null; address: string | null; kit: string | null }>((f, t) =>
      db.from("convocations").select("id, match_date, kickoff, meet_time, rival, is_home, competition, venue, address, kit").eq("published", true).gte("match_date", from).lte("match_date", to).order("match_date").order("id").range(f, t)),
  ]);

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const ev: string[] = [];
  const matchDays = new Set(convos.map((c) => c.match_date));
  for (const s of sessions) {
    // Els partits amb convocatòria publicada surten amb tota la informació (a sota)
    if (s.kind === "Partit" && matchDays.has(s.session_date)) continue;
    const start = s.start_time ? hhmm(s.start_time) : null;
    ev.push(vevent({
      uid: `sessio-${s.id}`, stamp, date: s.session_date, start, minutes: s.duration_min ?? 90,
      title: `${s.kind === "Partit" ? "⚽" : "🏃‍♀️"} ${s.name} · Juvenil C`, cancelled: s.cancelled,
    }));
  }
  for (const c of convos) {
    const kitKey = kitOf(c.kit);
    const kit = kitKey ? KITS.find((k) => k.key === kitKey)?.label : c.kit;
    const home = c.is_home ? "CE Europa" : c.rival, away = c.is_home ? c.rival : "CE Europa";
    const desc = [
      c.competition, c.meet_time ? `Quedada: ${hhmm(c.meet_time)} h` : null, c.kickoff ? `Partit: ${hhmm(c.kickoff)} h` : null,
      kit ? `Equipació: ${kit}` : null, "Força Europa! 💙",
    ].filter(Boolean).join("\n");
    ev.push(vevent({
      uid: `partit-${c.id}`, stamp, date: c.match_date, start: c.meet_time ? hhmm(c.meet_time) : c.kickoff ? hhmm(c.kickoff) : null, minutes: 150,
      title: `⚽ ${home} – ${away}`, location: [c.venue, c.address].filter(Boolean).join(", "), desc,
    }));
  }

  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CE Europa//Juvenil C//CA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Juvenil C · CE Europa", "X-WR-TIMEZONE:Europe/Madrid", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE, ...ev, "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="juvenil-c.ics"', "Cache-Control": "private, max-age=900" },
  });
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.replace(/-/g, "");

/** «20261102T200000» a partir del dia i l'hora (i els minuts que s'hi sumen). */
function local(date: string, hm: string, plus = 0) {
  const [h, m] = hm.split(":").map(Number);
  const total = h * 60 + m + plus;
  const day = addDays(date, Math.floor(total / 1440));
  const t = ((total % 1440) + 1440) % 1440;
  return `${ymd(day)}T${String(Math.floor(t / 60)).padStart(2, "0")}${String(t % 60).padStart(2, "0")}00`;
}

function vevent(o: { uid: string; stamp: string; date: string; start: string | null; minutes: number; title: string; location?: string; desc?: string; cancelled?: boolean }) {
  const when = o.start
    ? [`DTSTART;TZID=Europe/Madrid:${local(o.date, o.start)}`, `DTEND;TZID=Europe/Madrid:${local(o.date, o.start, o.minutes)}`]
    : [`DTSTART;VALUE=DATE:${ymd(o.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(o.date, 1))}`];
  return [
    "BEGIN:VEVENT", `UID:${o.uid}@wellness-europa`, `DTSTAMP:${o.stamp}`, ...when, `SUMMARY:${esc(o.title)}`,
    ...(o.location ? [`LOCATION:${esc(o.location)}`] : []), ...(o.desc ? [`DESCRIPTION:${esc(o.desc)}`] : []),
    ...(o.cancelled ? ["STATUS:CANCELLED"] : []), "END:VEVENT",
  ].join("\r\n");
}

/** Les línies d'un .ics no poden passar de 75 bytes: es parteixen amb un espai al principi. */
function fold(block: string) {
  return block.split("\r\n").map((line) => {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const out: string[] = [];
    let cur = "";
    for (const ch of line) {
      if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
    }
    out.push(cur);
    return out.join("\r\n ");
  }).join("\r\n");
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Madrid",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];
