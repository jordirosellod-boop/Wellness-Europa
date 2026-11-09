import { isCrestFile } from "@/lib/fcf";
import { fresh, groupMatches } from "@/lib/fcf-cache";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 30;

// Escuts dels equips del grup (dades públiques de la FCF; es guarden 12 h per no consultar la FCF cada cop)
// i els que ha afegit el staff (rivals d'amistosos), que van primer.
let cache: { at: number; teams: { id: string; name: string; crest: string }[] } | null = null;
const TTL = 12 * 3600 * 1000;

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL) {
    try {
      const db = adminClient();
      const { data: cfg } = await db.from("fcf_config").select("grup_id").eq("id", true).single();
      const all = cfg?.grup_id ? await groupMatches(db, cfg.grup_id as string, fresh(), 0) : [];
      const teams = new Map<string, { id: string; name: string; crest: string }>();
      for (const m of all) {
        for (const [id, name, file] of [[m.home_id, m.home, m.home_crest], [m.away_id, m.away, m.away_crest]] as const) {
          if (file && isCrestFile(file) && !teams.has(id)) teams.set(id, { id, name, crest: `/api/fcf/crest?f=${encodeURIComponent(file)}` });
        }
      }
      cache = { at: Date.now(), teams: [...teams.values()] };
    } catch (e) {
      // Si la FCF no respon, almenys es tornen els escuts afegits pel staff
      console.error("crests", e instanceof Error ? e.message : String(e));
    }
  }
  const extra = await extraCrests().catch(() => []);
  return Response.json({ teams: [...extra, ...(cache?.teams ?? [])] }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" } });
}

async function extraCrests(): Promise<{ id: string; name: string; crest: string }[]> {
  const { data, error } = await adminClient().from("team_crests").select("id, name, fcf_file, image, updated_at").order("name").order("id").range(0, 499);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((r) => {
    const v = Date.parse(r.updated_at as string) || 0;
    if (r.fcf_file && isCrestFile(r.fcf_file as string)) return [{ id: `x-${r.id}`, name: r.name as string, crest: `/api/fcf/crest?f=${encodeURIComponent(r.fcf_file as string)}` }];
    if (r.image) return [{ id: `x-${r.id}`, name: r.name as string, crest: `/api/fcf/crest?c=${r.id}&v=${v}` }];
    return [];
  });
}
