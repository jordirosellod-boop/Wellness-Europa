import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActaFull, type ActaFull } from "@/lib/fcf-bigdata";
import { fresh, groupMatches, sanctionsCached, scorersCached } from "@/lib/fcf-cache";
import type { BigRaw } from "@/lib/bigdata";

// Totes les dades públiques de la lliga (partits, actes, golejadores, sancions) per al Big Data i l'informe del rival.
// Les actes es guarden un cop llegides; cada crida en baixa com a molt `batch` de noves (de 4 en 4, per no carregar la FCF).
export async function leagueRaw(db: SupabaseClient, batch = 14): Promise<BigRaw> {
  const { data: cfg } = await db.from("fcf_config").select("grup_id, team_id").eq("id", true).single();
  if (!cfg) throw new Error("Falta la configuració de la FCF.");
  const grup = String(cfg.grup_id);
  const f = fresh();
  const [matches, scorers, sanctions] = await Promise.all([groupMatches(db, grup, f), scorersCached(db, grup, f), sanctionsCached(db, grup, f)]);
  const closed = matches.filter((m) => m.closed);
  const cached = new Map<string, ActaFull>();
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from("fcf_league_actas").select("acta_id, data").eq("grup_id", grup).order("acta_id").range(from, from + 499);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) cached.set(r.acta_id as string, r.data as ActaFull);
    if (!data || data.length < 500) break;
  }
  const missing = closed.filter((m) => !cached.has(m.acta_id)).slice(0, batch);
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
  return {
    us_id: String(cfg.team_id),
    matches,
    actas: Object.fromEntries(closed.filter((m) => cached.has(m.acta_id)).map((m) => [m.acta_id, cached.get(m.acta_id)!])),
    scorers,
    sanctions,
    pending: closed.filter((m) => !cached.has(m.acta_id)).length,
    stale_at: f.stale_at,
    updated_at: new Date().toISOString(),
  };
}
