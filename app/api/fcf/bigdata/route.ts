import { leagueRaw } from "@/lib/league-raw";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 60;

// Big Data de la lliga (dades públiques de la FCF). Només el responsable de l'app.
// Les actes es guarden un cop llegides; cada crida en baixa com a molt BATCH de noves.
const BATCH = 14;

async function isOwner(db: ReturnType<typeof adminClient>, uid: string) {
  const { data: ts } = await db.from("team_settings").select("owner_id").eq("id", true).maybeSingle();
  if (ts?.owner_id) return ts.owner_id === uid;
  const { data: first } = await db.from("profiles").select("id").eq("role", "coach").order("created_at").order("id").limit(1).maybeSingle();
  return first?.id === uid;
}

export async function GET(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat." }, { status: 401 });
  if (!(await isOwner(db, u.user.id))) return Response.json({ error: "Només el responsable de l'app." }, { status: 403 });

  try {
    return Response.json(await leagueRaw(db, BATCH));
  } catch (e) {
    return Response.json({ error: `No s'ha pogut llegir la FCF: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
