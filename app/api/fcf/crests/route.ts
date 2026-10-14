import { fetchGroupMatches, isCrestFile } from "@/lib/fcf";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 30;

// Escuts dels equips del grup (dades públiques de la FCF). Es guarden 12 h per no consultar la FCF cada cop.
let cache: { at: number; teams: { id: string; name: string; crest: string }[] } | null = null;
const TTL = 12 * 3600 * 1000;

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL) {
    try {
      const { data: cfg } = await adminClient().from("fcf_config").select("grup_id").eq("id", true).single();
      if (!cfg?.grup_id) return Response.json({ teams: [] });
      const all = await fetchGroupMatches(cfg.grup_id as string);
      const teams = new Map<string, { id: string; name: string; crest: string }>();
      for (const m of all) {
        for (const [id, name, file] of [[m.home_id, m.home, m.home_crest], [m.away_id, m.away, m.away_crest]] as const) {
          if (file && isCrestFile(file) && !teams.has(id)) teams.set(id, { id, name, crest: `/api/fcf/crest?f=${encodeURIComponent(file)}` });
        }
      }
      cache = { at: Date.now(), teams: [...teams.values()] };
    } catch (e) {
      if (!cache) return Response.json({ teams: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  return Response.json({ teams: cache.teams }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400" } });
}
