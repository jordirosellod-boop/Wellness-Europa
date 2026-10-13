import { fetchGroupMatches, standings } from "@/lib/fcf";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 30;

// Dades públiques de la FCF sobre el proper rival: classificació, ratxa i partits. Només staff.
export async function GET(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff." }, { status: 403 });

  const { data: cfg } = await db.from("fcf_config").select("grup_id, team_id").eq("id", true).single();
  if (!cfg) return Response.json({ error: "Falta la configuració de la FCF." }, { status: 500 });
  try {
    const all = await fetchGroupMatches(cfg.grup_id as string);
    const ours = all.filter((m) => m.home_id === cfg.team_id || m.away_id === cfg.team_id);
    // Proper partit: el primer sense tancar (si no n'hi ha, l'últim jugat).
    const next = ours.find((m) => !m.closed) ?? ours[ours.length - 1] ?? null;
    if (!next) return Response.json({ next: null });
    const rivalId = next.home_id === cfg.team_id ? next.away_id : next.home_id;
    const table = standings(all);
    const rivalMatches = all.filter((m) => m.closed && (m.home_id === rivalId || m.away_id === rivalId)).reverse();
    const vsUs = ours.filter((m) => m.acta_id !== next.acta_id && (m.home_id === rivalId || m.away_id === rivalId));
    return Response.json({
      next: { ...next, is_home: next.home_id === cfg.team_id, rival_id: rivalId, rival: next.home_id === cfg.team_id ? next.away : next.home },
      table,
      us_id: cfg.team_id,
      rival_matches: rivalMatches,
      vs_us: vsUs,
    });
  } catch (e) {
    return Response.json({ error: `No s'ha pogut llegir la FCF: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
