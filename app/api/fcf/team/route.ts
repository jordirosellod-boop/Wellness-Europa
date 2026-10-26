import { fresh, groupMatches, scorersCached } from "@/lib/fcf-cache";
import type { ActaFull } from "@/lib/fcf-bigdata";
import { findTeam, rivalSummary } from "@/lib/rival-summary";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 30;

// Resum d'un equip del grup (per a la fitxa del rival als talls de vídeo). Només staff.
export async function GET(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff." }, { status: 403 });

  const name = (new URL(req.url).searchParams.get("name") ?? "").trim().slice(0, 80);
  if (!name) return Response.json({ error: "Falta el nom de l'equip." }, { status: 400 });
  const { data: cfg } = await db.from("fcf_config").select("grup_id, team_id").eq("id", true).single();
  if (!cfg) return Response.json({ error: "Falta la configuració de la FCF." }, { status: 500 });
  try {
    const f = fresh();
    const [all, scorers] = await Promise.all([groupMatches(db, cfg.grup_id as string, f), scorersCached(db, cfg.grup_id as string, f).catch(() => [])]);
    // Actes guardades dels partits de l'equip (per comptar-ne les golejadores al dia).
    const team = findTeam(all, name);
    const ids = team ? all.filter((m) => m.closed && (m.home_id === team.id || m.away_id === team.id)).map((m) => m.acta_id) : [];
    const actas = new Map<string, ActaFull>();
    if (ids.length) {
      const { data } = await db.from("fcf_league_actas").select("acta_id, data").in("acta_id", ids);
      for (const r of data ?? []) actas.set(r.acta_id as string, r.data as ActaFull);
    }
    return Response.json({ summary: rivalSummary(all, scorers, name, cfg.team_id as string, f.stale_at, actas) });
  } catch (e) {
    return Response.json({ error: `No s'han pogut llegir les dades de la FCF: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
