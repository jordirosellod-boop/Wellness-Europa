import { fetchGroupMatches } from "@/lib/fcf";
import { fetchActaFull, fetchScorers, fetchSanctions, type ActaFull } from "@/lib/fcf-bigdata";
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

  const { data: cfg } = await db.from("fcf_config").select("grup_id, team_id").eq("id", true).single();
  if (!cfg) return Response.json({ error: "Falta la configuració de la FCF." }, { status: 500 });
  const grup = String(cfg.grup_id);
  try {
    const [matches, scorers, sanctions] = await Promise.all([fetchGroupMatches(grup), fetchScorers(grup), fetchSanctions(grup)]);
    const closed = matches.filter((m) => m.closed);

    // Actes ja llegides (paginat per si n'hi ha moltes)
    const cached = new Map<string, ActaFull>();
    for (let from = 0; ; from += 500) {
      const { data, error } = await db.from("fcf_league_actas").select("acta_id, data").eq("grup_id", grup).order("acta_id").range(from, from + 499);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) cached.set(r.acta_id as string, r.data as ActaFull);
      if (!data || data.length < 500) break;
    }
    const missing = closed.filter((m) => !cached.has(m.acta_id)).slice(0, BATCH);
    // De 4 en 4 per no carregar la web de la FCF
    for (let i = 0; i < missing.length; i += 4) {
      const part = missing.slice(i, i + 4);
      const got = await Promise.allSettled(part.map((m) => fetchActaFull(m.acta_id)));
      const rows = got.flatMap((g, k) => (g.status === "fulfilled" ? [{ acta_id: part[k].acta_id, grup_id: grup, jornada: part[k].jornada, data: g.value }] : []));
      if (rows.length) {
        const { error } = await db.from("fcf_league_actas").upsert(rows);
        if (error) throw new Error(error.message);
        rows.forEach((r) => cached.set(r.acta_id, r.data));
      }
    }
    const pending = closed.filter((m) => !cached.has(m.acta_id)).length;
    return Response.json({
      us_id: String(cfg.team_id),
      matches,
      actas: Object.fromEntries(closed.filter((m) => cached.has(m.acta_id)).map((m) => [m.acta_id, cached.get(m.acta_id)])),
      scorers,
      sanctions,
      pending,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: `No s'ha pogut llegir la FCF: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
