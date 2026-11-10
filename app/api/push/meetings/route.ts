import { adminClient, pushTo } from "@/lib/server-admin";
import { fmtDateSmart } from "@/lib/wellness";

// El staff ho crida en publicar una ronda de reunions (avisa cada jugadora amb el seu dia i hora)
// o en canviar-ne alguna d'una ronda ja publicada (avisa només les afectades).
export async function POST(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat. Torna a entrar." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff pot enviar avisos." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { round_id?: unknown; slot_ids?: unknown };
  const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  if (!uuid(body.round_id)) return Response.json({ error: "Falta la ronda." }, { status: 400 });
  const only = Array.isArray(body.slot_ids) ? body.slot_ids.filter(uuid).slice(0, 10) : null;

  const { data: round, error: e1 } = await db.from("meeting_rounds").select("id, title, published").eq("id", body.round_id).maybeSingle();
  if (e1) return Response.json({ error: e1.message }, { status: 500 });
  if (!round?.published) return Response.json({ error: "Primer cal publicar la ronda." }, { status: 400 });
  let q = db.from("meeting_slots").select("id, day, start_time, player_id").eq("round_id", round.id).not("player_id", "is", null).order("day").order("start_time").range(0, 199);
  if (only) q = q.in("id", only.length ? only : ["00000000-0000-0000-0000-000000000000"]);
  const { data: slots, error: e2 } = await q;
  if (e2) return Response.json({ error: e2.message }, { status: 500 });

  let sent = 0;
  try {
    for (const s of slots ?? []) {
      const when = fmtDateSmart(s.day as string);
      const day = /^(Avui|Demà)$/.test(when) ? when.toLowerCase() : `el ${when.toLowerCase()}`;
      sent += await pushTo(db, [s.player_id as string], {
        title: only ? "🗣️ La teva reunió ha canviat" : "🗣️ Tens reunió amb el staff",
        body: `${only ? "Ara és" : "És"} ${day} a les ${(s.start_time as string).slice(0, 5)} h. Una estona per parlar, tu i nosaltres.`,
        url: "/j",
      });
    }
    return Response.json({ sent });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
