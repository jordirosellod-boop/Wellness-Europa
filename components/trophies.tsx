"use client";

import { useEffect, useState } from "react";
import { crestFor, useCrests } from "@/components/crest";
import { fetchAttendance, fetchSessionsBetween } from "@/lib/attendance";
import { computeBadges, type Badge } from "@/lib/badges";
import { haptic } from "@/lib/feel";
import { fetchWinners } from "@/lib/mvp";
import { fetchAll, supabase } from "@/lib/supabase";

type Raw = { bestMonthAtt: boolean; goals: number; hatTrick: boolean; starts: number; fullMatch: boolean; mvps: number; rivals: string[] };

async function load(meId: string, from: string, today: string): Promise<Raw> {
  const sb = supabase();
  const [fcf, mins, sessions, winners] = await Promise.all([
    sb.from("fcf_players").select("fcf_id, starts, goals").eq("profile_id", meId).maybeSingle(),
    fetchAll<{ convocation_id: string; minutes: number }>((f, t) => sb.from("match_minutes").select("convocation_id, minutes").eq("player_id", meId).order("convocation_id").range(f, t)).catch(() => []),
    fetchSessionsBetween(from, today).catch(() => []),
    fetchWinners().catch(() => []),
  ]);
  const f = fcf.data as { fcf_id: string; starts: number; goals: number } | null;
  const rivals: string[] = [];
  let hatTrick = false;
  if (f) {
    const apps = await fetchAll<{ acta_id: string; goals: number }>((a, b) => sb.from("fcf_appearances").select("acta_id, goals").eq("fcf_id", f.fcf_id).order("acta_id").range(a, b)).catch(() => []);
    hatTrick = apps.some((a) => a.goals >= 3);
    if (apps.length) {
      const { data } = await sb.from("fcf_matches").select("home, away, is_home").in("acta_id", apps.map((a) => a.acta_id));
      for (const m of (data ?? []) as { home: string; away: string; is_home: boolean }[]) rivals.push(m.is_home ? m.away : m.home);
    }
  }
  if (mins.length) {
    const { data } = await sb.from("convocations").select("rival").in("id", mins.filter((m) => m.minutes > 0).map((m) => m.convocation_id));
    for (const c of (data ?? []) as { rival: string }[]) rivals.push(c.rival);
  }
  // Mesos sencers (ja acabats) amb el 100% d'entrenos
  const tr = sessions.filter((s) => s.kind === "Entrenament" && !s.cancelled && s.session_date < today.slice(0, 7) + "-01");
  const att = await fetchAttendance(tr.map((s) => s.id), meId).catch(() => []);
  const monthOf = new Map(tr.map((s) => [s.id, s.session_date.slice(0, 7)]));
  const t = new Map<string, { p: number; n: number }>();
  for (const a of att) { const k = monthOf.get(a.session_id); if (!k) continue; const x = t.get(k) ?? { p: 0, n: 0 }; x.n++; if (a.present) x.p++; t.set(k, x); }
  const bestMonthAtt = [...t.values()].some((x) => x.n >= 4 && x.p === x.n);
  return {
    bestMonthAtt, goals: f?.goals ?? 0, hatTrick, starts: f?.starts ?? 0,
    fullMatch: mins.some((m) => m.minutes >= 80), mvps: winners.filter((w) => w.player_id === meId).length, rivals,
  };
}

/** Insígnies i àlbum d'escuts, sota el cromo. Només ho veu ella. */
export function Trophies({ meId, from, today, streak }: { meId: string; from: string; today: string; streak: number }) {
  const teams = useCrests();
  const [raw, setRaw] = useState<Raw | null>(null);
  const [tab, setTab] = useState<"ins" | "alb">("ins");
  const [open, setOpen] = useState<Badge | null>(null);
  // Les insígnies que ja havia vist (per fer brillar les noves)
  const [seen] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`insignies:${meId}`) ?? "[]") as string[]; } catch { return []; } });
  useEffect(() => {
    let alive = true;
    load(meId, from, today).then((r) => alive && setRaw(r), () => {});
    return () => { alive = false; };
  }, [meId, from, today]);

  // L'àlbum: equips del grup (sense nosaltres). En color els que ja ha jugat.
  const played = new Set((raw?.rivals ?? []).map((r) => crestFor(teams, r)).filter(Boolean) as string[]);
  const group = teams.filter((x) => !x.id.startsWith("x-") && crestFor(teams, x.name) !== "/escut.png");
  const album = [...new Map(group.map((x) => [x.crest, x])).values()];
  const extra = [...played].filter((c) => !album.some((x) => x.crest === c));
  const badges = raw ? computeBadges({ ...raw, streak, rivals: played.size }) : [];
  const got = badges.filter((b) => b.got);

  // Insígnia nova des de l'última vegada: brilla i vibra un cop
  const gotKey = got.map((b) => b.id).join(",");
  const fresh = new Set(seen.length ? got.map((b) => b.id).filter((id) => !seen.includes(id)) : []);
  const anyFresh = fresh.size > 0;
  useEffect(() => {
    if (!gotKey) return;
    try { localStorage.setItem(`insignies:${meId}`, JSON.stringify(gotKey.split(","))); } catch { /* res */ }
    if (anyFresh) haptic();
  }, [gotKey, meId, anyFresh]);

  if (!raw) return null;
  return (
    <section className="card trophies" aria-label="Insígnies i àlbum d'escuts">
      <div className="tr-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "ins"} className={tab === "ins" ? "on" : ""} onClick={() => setTab("ins")}>🏅 Insígnies <small>{got.length}/{badges.length}</small></button>
        <button type="button" role="tab" aria-selected={tab === "alb"} className={tab === "alb" ? "on" : ""} onClick={() => setTab("alb")}>🛡️ Àlbum <small>{played.size}/{album.length + extra.length}</small></button>
      </div>
      {tab === "ins" ? (
        <>
          <div className="tr-badges">
            {badges.map((b, i) => (
              <button key={b.id} type="button" className={`tr-badge${b.got ? " got" : ""}${fresh.has(b.id) ? " fresh" : ""}`} style={{ ["--d" as string]: `${i * 0.04}s` }} onClick={() => setOpen(open?.id === b.id ? null : b)} aria-label={`${b.name}${b.got ? " (aconseguida)" : ""}`}>
                <span className="tr-medal" aria-hidden="true">{b.got ? b.icon : "🔒"}</span>
                <small>{b.name}</small>
              </button>
            ))}
          </div>
          {open && <p className="tr-why">{open.got ? "✓ Aconseguida: " : "Per aconseguir-la: "}{open.how}.</p>}
        </>
      ) : (
        <>
          <div className="tr-album">
            {[...album.map((x) => x.crest), ...extra].map((c, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={c} src={c} alt="" width={44} height={44} loading="lazy" className={played.has(c) ? "got" : ""} style={{ ["--d" as string]: `${i * 0.03}s` }} />
            ))}
          </div>
          <p className="tr-why">{played.size ? `Has jugat contra ${played.size} equip${played.size === 1 ? "" : "s"}. Els altres s'acoloreixen quan hi jugues.` : "Quan juguis un partit, l'escut del rival s'acolorirà aquí."}</p>
        </>
      )}
    </section>
  );
}
