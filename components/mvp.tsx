"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Crest } from "@/components/crest";
import { haptic } from "@/lib/feel";
import { kitFont } from "@/lib/fonts";
import { castVote, fetchMyVote, fetchWinners, type MvpWinner } from "@/lib/mvp";
import { supabase } from "@/lib/supabase";
import type { Convocation, RosterRow } from "@/lib/convo";

// Les MVP de l'últim partit (fins a 8 dies després): porten corona a tot arreu. Es demana un sol cop per pàgina.
let mvpIds: Promise<Set<string>> | null = null;
export function useMvpIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    mvpIds ??= fetchWinners().then((all) => {
      const recent = all.filter((w) => Date.now() - Date.parse(`${w.match_date}T12:00:00Z`) < 8 * 86_400_000);
      const last = recent.map((w) => w.match_date).sort().at(-1);
      return new Set(recent.filter((w) => w.match_date === last).map((w) => w.player_id));
    }).catch(() => new Set<string>());
    mvpIds.then((s) => alive && setIds(s), () => {});
    return () => { alive = false; };
  }, []);
  return ids;
}

/** Jugadora convocada: votar la MVP del partit (un vot, secret). */
export function MvpVoteCard({ meId, today }: { meId: string; today: string }) {
  const [v, setV] = useState<{ c: Convocation; mates: RosterRow[]; voted: boolean } | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMyVote(meId, today).then((x) => alive && setV(x), () => {});
    return () => { alive = false; };
  }, [meId, today]);
  if (!v) return null;
  async function vote() {
    if (!pick || !v) return;
    setBusy(true); setMsg(null);
    try { await castVote(v.c.id, pick); haptic(); setV({ ...v, voted: true }); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return (
    <section className="card mvp-card">
      <div className="mvp-h"><span className="mvp-star" aria-hidden="true">★</span><div><b>MVP del partit</b><small>contra {v.c.rival}</small></div><Crest name={v.c.rival} size={30} /></div>
      {v.voted ? (
        <p className="mvp-done">Gràcies pel teu vot! ⭐ El resultat surt demà a les 12 h.</p>
      ) : (
        <>
          <p className="muted small" style={{ margin: "4px 0 8px" }}>Qui ha estat la millor? El vot és secret i només es pot fer una vegada.</p>
          <div className="mvp-grid">
            {v.mates.map((r) => (
              <button key={r.player_id} type="button" className={pick === r.player_id ? "on" : ""} onClick={() => setPick(r.player_id)}>
                <b>{r.dorsal ?? "·"}</b><span>{r.display_name.split(" ")[0]}</span>
              </button>
            ))}
          </div>
          {msg && <p className="msg error">{msg}</p>}
          <button type="button" className="btn block" style={{ marginTop: 10 }} disabled={!pick || busy} onClick={() => void vote()}>{busy ? "Votant…" : "⭐ Votar"}</button>
        </>
      )}
    </section>
  );
}

/** La revelació de la MVP (un cop per partit, els 3 dies després de tancar la votació). La veuen jugadores i staff. */
export function MvpReveal() {
  const [show, setShow] = useState<{ w: MvpWinner[]; names: Map<string, { name: string; dorsal: number | null }> } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await fetchWinners();
      const recent = all.filter((w) => Date.now() - Date.parse(`${w.match_date}T12:00:00Z`) < 4 * 86_400_000);
      const cid = recent[0]?.convocation_id;
      if (!cid) return;
      const key = `mvp-vista:${cid}`;
      try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch { return; }
      const { data } = await supabase().rpc("team_roster").range(0, 199);
      const names = new Map(((data ?? []) as { player_id: string; display_name: string; dorsal: number | null }[]).map((r) => [r.player_id, { name: r.display_name, dorsal: r.dorsal }]));
      if (alive) setShow({ w: recent.filter((w) => w.convocation_id === cid), names });
    })().catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!show) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => haptic(), 1000);
    return () => clearTimeout(t);
  }, [show]);
  if (!show || typeof document === "undefined") return null;
  const first = show.w[0];
  const who = show.w.map((w) => show.names.get(w.player_id)).filter(Boolean) as { name: string; dorsal: number | null }[];
  if (!who.length) return null;
  return createPortal(
    <div className={`walkout mvp-reveal ${kitFont.variable}`} role="dialog" aria-label="MVP del partit" onClick={() => setShow(null)}>
      <i className="wo-light l" aria-hidden="true" /><i className="wo-light r" aria-hidden="true" />
      <div className="wo-body">
        <span className="mvp-k">★ MVP DEL PARTIT ★</span>
        <span className="wo-num" aria-hidden="true">{who.length === 1 ? who[0].dorsal ?? "★" : "★"}</span>
        <b className="wo-title">{who.map((x) => x.name.toUpperCase()).join(" i ")}</b>
        <span className="wo-vs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escut.png" alt="" width={30} height={30} /><i>vs</i><Crest name={first.rival} size={30} />
        </span>
        <span className="wo-when">Votada per les companyes</span>
        <button type="button" className="wo-go" onClick={() => setShow(null)}>Enhorabona! 👏</button>
      </div>
    </div>,
    document.body,
  );
}
