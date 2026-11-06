import { adminClient, pushToPlayers, pushToStaff } from "@/lib/server-admin";
import { fmtDateSmart } from "@/lib/wellness";

// El staff ho crida en penjar l'entreno a l'app: avisa les jugadores (i la resta del staff).
export async function POST(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat. Torna a entrar." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff pot enviar avisos." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { plan_id?: string; changed?: boolean };
  if (typeof body.plan_id !== "string" || !/^[0-9a-f-]{36}$/.test(body.plan_id)) return Response.json({ error: "Falta l'entreno." }, { status: 400 });
  const { data: t, error } = await db.from("published_trainings").select("plan_date").eq("plan_id", body.plan_id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!t) return Response.json({ error: "Primer cal penjar l'entreno." }, { status: 400 });

  const when = fmtDateSmart(t.plan_date as string);
  const day = /^(Avui|Demà|Ahir)$/.test(when) ? when.toLowerCase() : `el ${when.toLowerCase()}`;
  try {
    const r = await pushToPlayers(db, {
      title: body.changed ? "📋 Entreno actualitzat" : "📋 Entreno penjat",
      body: body.changed ? `Hi ha canvis a l'entreno de ${day}. Entra a mirar-ho!` : `Ja tens l'entreno de ${day}: tasques i equips. Entra a veure'l!`,
      url: "/j?s=entreno",
    });
    const staff = await pushToStaff(db, {
      title: body.changed ? "📋 Entreno actualitzat" : "📋 Entreno penjat",
      body: `L'entreno de ${day} ja és a l'app de les jugadores.`,
      url: "/entrenador/entreno",
    }, u.user.id).catch(() => 0);
    return Response.json({ ...r, staff });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
