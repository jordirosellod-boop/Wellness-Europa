import type { ActaFull } from "@/lib/fcf-bigdata";
import { matchNames, normalize, prettyPlace } from "@/lib/fcf";
import { fresh, groupMatches, sideOf, teamMatchesOf, writeManual, writeManualMany, type ManualMatch } from "@/lib/fcf-cache";
import { parseFcfText } from "@/lib/fcf-paste";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 60;

// «Enganxar de la FCF»: el staff copia l'acta d'un partit de la web de la FCF (com qualsevol espectador) i l'enganxa.
// Es desa el resultat, la data i l'hora reals, els gols i les alineacions; després tot (calendari, Big Data,
// informe del rival i estadístiques) es calcula amb aquestes dades.
export async function POST(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat. Torna a entrar." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; save?: unknown };
  const text = typeof body.text === "string" ? body.text.slice(0, 60_000) : "";
  const parsed = parseFcfText(text);
  if (!parsed) return Response.json({ error: "No hi trobo cap acta ni cap jornada de resultats. Copia tota la pàgina (l'acta d'un partit o la pestanya Resultats d'una jornada)." }, { status: 400 });

  const { data: cfg } = await db.from("fcf_config").select("grup_id, team_id").eq("id", true).single();
  if (!cfg) return Response.json({ error: "Falta la configuració de la FCF." }, { status: 500 });
  const grup = cfg.grup_id as string;
  const all = await groupMatches(db, grup, fresh(), 0);

  // Pestanya «Resultats» d'una jornada: data, hora i resultat de tots els partits del grup
  if (parsed.kind === "results") {
    const found = parsed.results.flatMap((r) => {
      const m = all.find((x) => sideOf(x, r.home) === "home" && sideOf(x, r.away) === "away");
      return m ? [{ r, m }] : [];
    });
    if (!found.length) return Response.json({ error: "No trobo cap d'aquests partits al nostre grup." }, { status: 404 });
    const jornades = [...new Set(found.map((f) => f.m.jornada))].sort((a, b) => a - b);
    const us = found.find((f) => f.m.home_id === cfg.team_id || f.m.away_id === cfg.team_id);
    const preview = {
      kind: "results", jornades, matched: found.length, skipped: parsed.results.length - found.length,
      closed: found.filter((f) => f.r.closed).length,
      ours: us ? `${us.m.home} ${us.r.home_goals ?? "–"} – ${us.r.away_goals ?? "–"} ${us.m.away}${us.r.date ? ` · ${us.r.date.split("-").reverse().join("/")}${us.r.time ? ` ${us.r.time} h` : ""}` : ""}` : null,
    };
    if (body.save !== true) return Response.json({ preview });
    const items: Record<string, ManualMatch> = {};
    for (const { r, m } of found) {
      items[m.acta_id] = {
        ...(r.date ? { kickoff: `${r.date}T${r.time ?? (m.kickoff?.slice(11, 16) || "00:00")}:00` } : {}),
        ...(r.closed ? { home_goals: r.home_goals, away_goals: r.away_goals, closed: true } : {}),
      };
    }
    await writeManualMany(db, grup, items);
    await saveVenues(db, found.map(({ r, m }) => ({ acta: m.acta_id, venue: r.venue })));
    await refreshOurs(db, grup, cfg.team_id as string);
    return Response.json({ ok: true, preview });
  }

  const a = parsed.acta;
  const m = all.find((x) => sideOf(x, a.home) === "home" && sideOf(x, a.away) === "away");
  if (!m) return Response.json({ error: `No trobo el partit ${a.home} – ${a.away} al grup.` }, { status: 404 });

  const ours = sideOf(m, a.home) && (m.home_id === cfg.team_id || m.away_id === cfg.team_id);
  const preview = {
    kind: "acta", jornada: m.jornada, home: m.home, away: m.away, date: a.date, time: a.time,
    home_goals: a.home_goals, away_goals: a.away_goals, finished: a.finished,
    goals: a.goals.length, players: a.players.length, ours,
  };
  if (body.save !== true) return Response.json({ preview });

  // 1. Data, hora i resultat del partit
  const kickoff = a.date ? `${a.date}T${a.time ?? (m.kickoff?.slice(11, 16) || "00:00")}:00` : m.kickoff;
  await writeManual(db, grup, m.acta_id, {
    kickoff, ...(a.finished && a.home_goals != null && a.away_goals != null ? { home_goals: a.home_goals, away_goals: a.away_goals, closed: true } : {}),
  });

  await saveVenues(db, [{ acta: m.acta_id, venue: a.venue }]);

  // 2. L'acta (per als golejadors i el Big Data): les jugadores ja conegudes conserven el seu identificador
  const { data: known } = await db.from("fcf_players").select("fcf_id, full_name").range(0, 999);
  const idOf = new Map((known ?? []).map((p) => [normalize(p.full_name as string), p.fcf_id as string]));
  const pid = (name: string) => idOf.get(normalize(name)) ?? `n-${normalize(name).replace(/\s+/g, "-").slice(0, 60)}`;
  const acta: ActaFull = {
    players: a.players.map((p) => ({ id: pid(p.name), name: p.name, dorsal: p.dorsal, titular: p.titular, gk: false, cap: p.cap, team: p.team, yc: 0, rc: 0 })),
    goals: a.goals.filter((g) => g.name).map((g) => ({ id: pid(g.name), name: g.name, team: g.team, minute: g.minute, kind: g.own ? "GOL EN PRÒPIA" : g.penalty ? "GOL PENAL" : "GOL" })),
  };
  if (acta.players.length || acta.goals.length) {
    const { error } = await db.from("fcf_league_actas").upsert({ acta_id: m.acta_id, grup_id: grup, jornada: m.jornada, data: acta });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // 3. Els nostres partits (calendari, proper partit) amb les dades noves
  const now = new Date().toISOString();
  try { await refreshOurs(db, grup, cfg.team_id as string); } catch (e) { return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }

  // 4. Si és un partit nostre: alineació i gols de cada jugadora, i els seus totals
  let players = 0;
  if (ours) {
    const usSide = m.home_id === cfg.team_id ? "home" : "away";
    const lineup = a.players.filter((p) => sideOf(m, p.team) === usSide);
    if (lineup.length) {
      const rows = lineup.map((p) => ({ fcf_id: pid(p.name), full_name: p.name, dorsal: p.dorsal, updated_at: now }));
      const { error: e1 } = await db.from("fcf_players").upsert(rows, { onConflict: "fcf_id" });
      if (e1) return Response.json({ error: e1.message }, { status: 500 });
      const apps = lineup.map((p) => ({
        acta_id: m.acta_id, fcf_id: pid(p.name), titular: p.titular, dorsal: p.dorsal,
        goals: a.goals.filter((g) => !g.own && g.side === usSide && g.name && normalize(g.name) === normalize(p.name)).length,
      }));
      const { error: e2 } = await db.from("fcf_appearances").upsert(apps, { onConflict: "acta_id,fcf_id" });
      if (e2) return Response.json({ error: e2.message }, { status: 500 });
      // Totals a partir de totes les actes guardades
      const { data: allApps } = await db.from("fcf_appearances").select("fcf_id, titular, goals").range(0, 4999);
      const tot = new Map<string, { matches: number; starts: number; goals: number }>();
      for (const r of allApps ?? []) {
        const t = tot.get(r.fcf_id as string) ?? { matches: 0, starts: 0, goals: 0 };
        t.matches++; if (r.titular) t.starts++; t.goals += Number(r.goals) || 0;
        tot.set(r.fcf_id as string, t);
      }
      for (const [id, t] of tot) await db.from("fcf_players").update({ ...t, updated_at: now }).eq("fcf_id", id);
      players = lineup.length;
      // Relaciona les fitxes noves amb les jugadores de l'app quan el nom coincideix clarament
      const [{ data: fp }, { data: profiles }] = await Promise.all([
        db.from("fcf_players").select("fcf_id, full_name, profile_id").range(0, 999),
        db.from("profiles").select("id, display_name").eq("role", "player").range(0, 999),
      ]);
      const linked = new Set((fp ?? []).filter((x) => x.profile_id).map((x) => x.profile_id as string));
      const free = (profiles ?? []).filter((x) => !linked.has(x.id as string)) as { id: string; display_name: string }[];
      const pending = (fp ?? []).filter((x) => !x.profile_id) as { fcf_id: string; full_name: string }[];
      for (const [fcfId, profileId] of matchNames(pending, free)) {
        await db.from("fcf_players").update({ profile_id: profileId }).eq("fcf_id", fcfId).is("profile_id", null);
      }
    }
  }
  await db.from("fcf_config").update({ last_sync: now, last_error: null }).eq("id", true);
  return Response.json({ ok: true, preview, players });
}

/** Torna a desar els nostres partits (calendari, proper partit, estadístiques) amb les dades enganxades. */
async function refreshOurs(db: SupabaseClient, grup: string, teamId: string) {
  const updated = await groupMatches(db, grup, fresh(), 0);
  const mine = teamMatchesOf(updated, teamId);
  if (!mine.length) return;
  const now = new Date().toISOString();
  const { error } = await db.from("fcf_matches").upsert(mine.map((x) => ({ ...x, updated_at: now })), { onConflict: "acta_id" });
  if (error) throw new Error(error.message);
  await db.from("fcf_config").update({ last_sync: now, last_error: null }).eq("id", true);
}

/** El camp de cada partit (per omplir sol el camp de la convocatòria). No es trepitja un que ja tingui adreça. */
async function saveVenues(db: SupabaseClient, list: { acta: string; venue: string | null }[]) {
  const withVenue = list.filter((x) => x.venue && x.venue.trim().length > 2);
  if (!withVenue.length) return;
  const keys = withVenue.map((x) => `venue:${x.acta}`);
  const { data: cur } = await db.from("fcf_cache").select("key, data").in("key", keys);
  const has = new Map((cur ?? []).map((r) => [r.key as string, r.data as { address?: string | null }]));
  const now = new Date().toISOString();
  const rows = withVenue.filter((x) => !has.get(`venue:${x.acta}`)?.address).map((x) => ({
    key: `venue:${x.acta}`, fetched_at: now,
    data: { acta_id: x.acta, venue: prettyPlace(x.venue!).slice(0, 120), address: null, lat: null, lng: null },
  }));
  if (rows.length) await db.from("fcf_cache").upsert(rows).then(() => {}, () => {});
}
