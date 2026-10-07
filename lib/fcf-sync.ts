import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActaPayload, fetchPlayerTotals, fetchTeamMatches, matchNames, parseActa } from "./fcf";

type Config = { temporada: string; grup_id: string; team_id: string; team_match: string };

/**
 * Sincronitza les estadístiques de la FCF amb la base de dades (amb la clau secreta).
 * 1. Partits del nostre equip (resultats).
 * 2. Actes tancades: alineació (titular/suplent) i gols de cada jugadora.
 * 3. Totals de temporada de cada jugadora (partits, gols, sancions) segons la FCF.
 * 4. Relaciona noms FCF ↔ app quan la coincidència és clara.
 */
export async function syncFcf(db: SupabaseClient) {
  const { data: cfg, error: cErr } = await db.from("fcf_config").select("temporada, grup_id, team_id, team_match").eq("id", true).single();
  if (cErr || !cfg) throw new Error(cErr?.message ?? "Falta la configuració de la FCF.");
  const c = cfg as Config;
  try {
    const matches = await fetchTeamMatches(c.grup_id, c.team_id);
    const now = new Date().toISOString();
    if (matches.length) {
      const { error } = await db.from("fcf_matches").upsert(matches.map((m) => ({ ...m, updated_at: now })), { onConflict: "acta_id" });
      if (error) throw new Error(error.message);
    }

    // Actes tancades: es tornen a llegir sempre (són poques i així es recullen correccions de l'àrbitre).
    const players = new Map<string, { fcf_id: string; full_name: string; dorsal: string }>();
    const appearances: { acta_id: string; fcf_id: string; titular: boolean; dorsal: string; goals: number }[] = [];
    for (const m of matches.filter((x) => x.closed)) {
      const { players: lineup, goals } = parseActa(await fetchActaPayload(m.acta_id), c.team_match);
      for (const p of lineup) {
        players.set(p.fcf_id, { fcf_id: p.fcf_id, full_name: p.full_name, dorsal: p.dorsal });
        const scored = goals.filter((g) => g.fcf_id === p.fcf_id && g.kind !== "GOL EN PRÒPIA").length;
        appearances.push({ acta_id: m.acta_id, fcf_id: p.fcf_id, titular: p.titular, dorsal: p.dorsal, goals: scored });
      }
    }

    // Totals oficials de la FCF per jugadora.
    const rows = [];
    for (const p of players.values()) {
      const t = await fetchPlayerTotals(p.fcf_id, c.grup_id, c.temporada);
      const starts = appearances.filter((a) => a.fcf_id === p.fcf_id && a.titular).length;
      rows.push({ ...p, matches: t.matches, goals: t.goals, sanctions: t.sanctions, starts, updated_at: now });
    }
    if (rows.length) {
      const { error } = await db.from("fcf_players").upsert(rows, { onConflict: "fcf_id" });
      if (error) throw new Error(error.message);
    }
    if (appearances.length) {
      const { error } = await db.from("fcf_appearances").upsert(appearances, { onConflict: "acta_id,fcf_id" });
      if (error) throw new Error(error.message);
    }

    // Relació automàtica de noms (només per a fitxes encara sense relacionar).
    const [{ data: fcfPlayers }, { data: profiles }] = await Promise.all([
      db.from("fcf_players").select("fcf_id, full_name, profile_id"),
      db.from("profiles").select("id, display_name").eq("role", "player"),
    ]);
    const linked = new Set((fcfPlayers ?? []).filter((p) => p.profile_id).map((p) => p.profile_id as string));
    const free = (profiles ?? []).filter((p) => !linked.has(p.id as string)) as { id: string; display_name: string }[];
    const pending = (fcfPlayers ?? []).filter((p) => !p.profile_id) as { fcf_id: string; full_name: string }[];
    let autoLinked = 0;
    for (const [fcfId, profileId] of matchNames(pending, free)) {
      const { error } = await db.from("fcf_players").update({ profile_id: profileId }).eq("fcf_id", fcfId).is("profile_id", null);
      if (!error) autoLinked++;
    }

    await db.from("fcf_config").update({ last_sync: now, last_error: null }).eq("id", true);
    return { matches: matches.length, closed: matches.filter((m) => m.closed).length, players: rows.length, autoLinked };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("fcf_config").update({ last_error: msg.slice(0, 500) }).eq("id", true);
    throw e;
  }
}
