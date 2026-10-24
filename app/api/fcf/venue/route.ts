import { fetchMatchVenue } from "@/lib/fcf";
import { fresh, groupMatches, rivalKey } from "@/lib/fcf-cache";
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
    if (v?.venue) await db.from("fcf_cache").upsert({ key: `venue:${v.acta_id}`, data: v, fetched_at: new Date().toISOString() }).then(() => {}, () => {});
    return Response.json({ venue: v });
  } catch (e) {
    // La FCF no respon: el camp guardat d'aquest partit o, si no, el d'una convocatòria anterior.
    const f = fresh();
    const m = await groupMatches(db, cfg.grup_id as string, f, 0)
      .then((l) => l.filter((x) => x.home_id === cfg.team_id || x.away_id === cfg.team_id).find((x) => (acta ? x.acta_id === acta : x.kickoff?.slice(0, 10) === date)))
      .catch(() => undefined);
    if (m) {
      const { data: c } = await db.from("fcf_cache").select("data").eq("key", `venue:${m.acta_id}`).maybeSingle();
      if (c?.data) return Response.json({ venue: c.data, stale: true });
      const home = m.home_id === cfg.team_id;
      const rival = rivalKey(home ? m.away : m.home);
      const { data: prev } = await db.from("convocations").select("rival, is_home, venue, address").eq("is_home", home).not("venue", "is", null)
        .order("match_date", { ascending: false }).order("id").range(0, 199);
      const hit = (prev ?? []).find((p) => home || rivalKey(p.rival as string) === rival);
      if (hit) return Response.json({ venue: { acta_id: m.acta_id, venue: hit.venue, address: hit.address, lat: null, lng: null }, stale: true, from: "convo" });
    }
    return Response.json({ error: `La FCF ara mateix no deixa consultar el camp i no en tinc cap de guardat per a aquest partit. Escriu-lo a mà. (${e instanceof Error ? e.message : e})` }, { status: 502 });
  }
}
