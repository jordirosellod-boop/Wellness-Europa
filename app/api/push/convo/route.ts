import { adminClient, pushToPlayers } from "@/lib/server-admin";

// El staff ho crida en publicar una convocatòria: envia un avís a totes les jugadores
// que tenen les notificacions activades. Només el staff (amb la seva sessió).
export async function POST(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat. Torna a entrar." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff pot enviar avisos." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const { data: c, error: cErr } = await db.from("convocations").select("id, rival, match_date, kickoff, published").eq("id", id).maybeSingle();
  if (cErr) return Response.json({ error: cErr.message }, { status: 500 });
  if (!c) return Response.json({ error: "Convocatòria no trobada." }, { status: 404 });
  if (!c.published) return Response.json({ error: "Primer cal publicar la convocatòria." }, { status: 400 });

  const day = new Intl.DateTimeFormat("ca-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${c.match_date}T12:00:00Z`));
  let r: { sent: number; players: number };
  try {
    r = await pushToPlayers(db, {
      title: "Convocatòria penjada",
      body: `Partit contra ${c.rival} · ${day}${c.kickoff ? ` a les ${String(c.kickoff).slice(0, 5)}` : ""}. Entra a veure-la!`,
      url: "/j?s=convo",
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  await db.from("convocations").update({ notified_at: new Date().toISOString() }).eq("id", c.id);
  return Response.json(r);
}
