import { fetchMatchVenue } from "@/lib/fcf";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 30;

// Camp i adreça d'un partit nostre, segons la FCF (dades públiques). Només staff.
export async function GET(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff." }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const acta = q.get("acta") ?? undefined;
  const date = q.get("date") ?? undefined;
  if (acta ? !/^\d{1,12}$/.test(acta) : !(date && /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return Response.json({ error: "Falta el partit (acta o dia)." }, { status: 400 });
  }
  const { data: cfg } = await db.from("fcf_config").select("grup_id, team_id").eq("id", true).single();
  if (!cfg) return Response.json({ error: "Falta la configuració de la FCF." }, { status: 500 });
  try {
    const v = await fetchMatchVenue(cfg.grup_id as string, cfg.team_id as string, { acta, date });
    return Response.json({ venue: v });
  } catch (e) {
    return Response.json({ error: `No s'ha pogut llegir la FCF: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
