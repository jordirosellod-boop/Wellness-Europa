import { leagueRaw } from "@/lib/league-raw";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 60;

// Dades de la lliga per a l'informe del rival (dades públiques de la FCF). Només staff.
export async function GET(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff." }, { status: 403 });
  try {
    return Response.json(await leagueRaw(db, 14));
  } catch (e) {
    return Response.json({ error: `No s'ha pogut llegir la FCF: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
