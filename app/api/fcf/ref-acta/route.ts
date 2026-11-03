import { rivalKey } from "@/lib/analysis";
import { fetchActaFull } from "@/lib/fcf-bigdata";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 30;

// Actes de temporades passades del rival que enganxa el staff (pàgines públiques de la FCF, una a una).
// Serveixen per saber quines jugadores del rival ja hi eren l'any passat.

async function coach(req: Request, db: ReturnType<typeof adminClient>) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return null;
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  return me?.role === "coach" ? u.user.id : null;
}

/** Quantes paraules del nom del club comparteixen dos noms d'equip («PREMIA DALT, C.D. A» i «PREMIA DALT, C.D. B»). */
const shared = (a: string, b: string) => {
  const w = new Set(rivalKey(a).split(" ").filter((x) => x.length > 2));
  return rivalKey(b).split(" ").filter((x) => w.has(x)).length;
};

export async function POST(req: Request) {
  const db = adminClient();
  const me = await coach(req, db);
  if (!me) return Response.json({ error: "Només el staff." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { rival?: string; link?: string; label?: string };
  const rival = (body.rival ?? "").trim();
  const id = String(body.link ?? "").match(/acta\/(\d{4,12})/)?.[1] ?? String(body.link ?? "").trim().match(/^(\d{4,12})$/)?.[1];
  if (!rival || rival.length > 120) return Response.json({ error: "Falta l'equip rival." }, { status: 400 });
  if (!id) return Response.json({ error: "Enganxa l'enllaç d'una acta de la FCF (fcf.cat/ca/competicio/acta/…)." }, { status: 400 });
  try {
    const acta = await fetchActaFull(id);
    const teams = [...new Set(acta.players.map((p) => p.team))];
    if (!teams.length) return Response.json({ error: "Aquesta acta no té alineacions (potser el partit no es va jugar)." }, { status: 422 });
    // L'equip del club rival dins de l'acta (el que més s'assembla de nom)
    const best = teams.map((t) => ({ t, n: shared(rival, t) })).sort((a, b) => b.n - a.n)[0];
    if (!best || best.n === 0) return Response.json({ error: `En aquesta acta no hi juga cap equip del club (${teams.join(" i ")}).` }, { status: 422 });
    const side = { players: acta.players.filter((p) => p.team === best.t), goals: acta.goals.filter((g) => g.team === best.t) };
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : null;
    const { data, error } = await db.from("rival_ref_actas")
      .upsert({ rival_key: rivalKey(rival), acta_id: id, team: best.t.slice(0, 120), label, data: side, created_by: me }, { onConflict: "rival_key,acta_id" })
      .select("id, rival_key, acta_id, team, label, data").single();
    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: `No s'ha pogut llegir l'acta: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const db = adminClient();
  if (!(await coach(req, db))) return Response.json({ error: "Només el staff." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Falta quina." }, { status: 400 });
  const { error } = await db.from("rival_ref_actas").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
