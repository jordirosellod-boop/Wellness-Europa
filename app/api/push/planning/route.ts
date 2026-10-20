import { weekRange } from "@/lib/dates";
import { adminClient, pushToPlayers } from "@/lib/server-admin";

// El staff ho crida en publicar el planning de la setmana: avisa totes les jugadores
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
  const week = typeof body.week_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start) ? body.week_start : "";
  const changed = body.changed === true;
  if (!week) return Response.json({ error: "Falta la setmana." }, { status: 400 });
  const { data: p, error } = await db.from("weekly_plans").select("week_start, published").eq("week_start", week).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!p) return Response.json({ error: "Planning no trobat." }, { status: 404 });
  if (!p.published) return Response.json({ error: "Primer cal publicar el planning." }, { status: 400 });

  const range = weekRange(week).replace(/^Del/, "del");
  try {
    const r = await pushToPlayers(db, {
      title: changed ? "Planning actualitzat" : "Planning de la setmana",
      body: changed ? `Hi ha canvis al planning ${range}. Entra a mirar-ho!` : `Ja tens el planning ${range}. Entra a veure'l!`,
      url: "/j?s=planning",
    });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
