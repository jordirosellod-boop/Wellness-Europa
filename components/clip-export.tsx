"use client";

import { crestFor, useCrests } from "@/components/crest";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Shape } from "@/components/telestrator";
import { minuteOf, prettyTeam, rivalKey, teamLabels, toVideo, videoRank, HIGHLIGHT_BUTTON, type AButton, type AEvent, type AMatch } from "@/lib/analysis";
import { prettyPlayer } from "@/lib/bigdata";
import { exportClips, ExportError, rivalPages, totalSeconds, type Clip, type RivalCard, type Section } from "@/lib/clip-export";
import type { RivalSummary } from "@/lib/rival-summary";
import { supabase } from "@/lib/supabase";
import { canShareFile, deliverFile, safeName } from "@/lib/share-file";
import { fmtDate } from "@/lib/wellness";
import { asFile, createVideoWriter, deleteVideo, keepAwake, listVideos, markOnDrive, type SavedVideo } from "@/lib/saved-videos";
import { connectDrive, disconnectDrive, driveStatus, uploadToDrive, type DriveStatus } from "@/lib/drive-upload";
import { Ticked } from "@/components/feel";
import { deleteWithUndo } from "@/lib/undo";

type TeamFilter = "us" | "rival" | "all";
type Job = { label: string; progress: number; ctrl: AbortController };

const mb = (b: number) => (b < 10e6 ? `${(b / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1e6)} MB`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

type ScoutFields = { system?: string; strengths?: string; weaknesses?: string; keys?: string; key_players?: { dorsal: string; name: string; pos: string }[] };

/** Fitxa del rival: dades de la FCF (classificació, partits, golejadores) i el nostre informe, si n'hi ha. */
function useRivalCard(match: AMatch, crest: string | null): { card: RivalCard | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ card: RivalCard | null; loading: boolean; error: string | null }>({ card: null, loading: !!match.rival, error: null });
  useEffect(() => {
    if (!match.rival) return;
    let alive = true;
    (async () => {
      const sb = supabase();
      const { data: sess } = await sb.auth.getSession();
      const res = await fetch(`/api/fcf/team?name=${encodeURIComponent(match.rival!)}`, { headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}` }, cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { summary?: RivalSummary | null; error?: string };
      if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
      const s = j.summary;
      if (!s) return null;
      // Informe del rival (el més recent fins al dia del partit).
      const { data: rows } = await sb.from("rival_scouting").select("fields, match_date").eq("rival_key", rivalKey(prettyTeam(s.name)))
        .lte("match_date", match.match_date).order("match_date", { ascending: false }).order("id").range(0, 0);
      const f = ((rows ?? [])[0]?.fields ?? null) as ScoutFields | null;
      const card: RivalCard = {
        s,
        name: prettyTeam(s.name),
        crest,
        last: s.last.map((g) => ({ label: `J${g.jornada} · ${g.home ? "a casa" : "a fora"} vs ${prettyTeam(g.opp)}`, score: `${g.gf}-${g.ga}`, res: g.res })),
        scorers: s.scorers.map((p) => ({ name: prettyPlayer(p.name), goals: p.goals })),
        scout: f
          ? {
              system: f.system ?? "", strengths: f.strengths ?? "", weaknesses: f.weaknesses ?? "", keys: f.keys ?? "",
              players: (f.key_players ?? []).filter((k) => k.name || k.dorsal).map((k) => [k.dorsal && `${k.dorsal}`, k.name, k.pos && `(${k.pos})`].filter(Boolean).join(" ")),
            }
          : null,
      };
      return card;
    })().then(
      (card) => alive && setState({ card, loading: false, error: null }),
      (e) => alive && setState({ card: null, loading: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [match.rival, match.match_date, crest]);
  return state;
}

/** Descarregar els talls del vídeo: un per un, per apartats (accions) o tots junts. */
export function ClipExport({ match, events, buttons, file, playerName }: {
  match: AMatch; events: AEvent[]; buttons: AButton[]; file: File | string | null; playerName: (id: string | null) => string;
}) {
  const L = teamLabels(match);
  const [team, setTeam] = useState<TeamFilter>("us");
  const [cards, setCards] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [drawings, setDrawings] = useState(true);
  const [withRival, setWithRival] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [ready, setReady] = useState<File | null>(null);
  // Vídeos fets (i el seu fitxer ja preparat: el menú de compartir s'ha d'obrir just en tocar)
  const [saved, setSaved] = useState<{ v: SavedVideo; file: File }[]>([]);
  const withFile = async (v: SavedVideo) => ({ v, file: await asFile(v) });
  // Google Drive: si està connectat, cada vídeo fet s'hi puja sol
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [up, setUp] = useState<Record<string, number>>({});
  const [driveMsg, setDriveMsg] = useState<{ ok: boolean; text: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const r = new URLSearchParams(window.location.search).get("drive");
    return r === "ok" ? { ok: true, text: "Google Drive connectat ✓ Els vídeos de talls s'hi pujaran sols." }
      : r === "error" ? { ok: false, text: "No s'ha pogut connectar el Google Drive. Torna-ho a provar." }
      : r === "no" ? { ok: false, text: "No s'ha donat permís al Google Drive." } : null;
  });
  useEffect(() => {
    let alive = true;
    driveStatus().then((d) => alive && setDrive(d), () => {});
    return () => { alive = false; };
  }, []);
  async function toDrive(v: SavedVideo, f: File) {
    if (up[v.id] != null) return;
    setUp((u) => ({ ...u, [v.id]: 0 }));
    const release = await keepAwake();
    try {
      const link = await uploadToDrive(f, (p) => setUp((u) => ({ ...u, [v.id]: p })));
      await markOnDrive(v.id, link).catch(() => {});
      setSaved((l) => l.map((x) => (x.v.id === v.id ? { ...x, v: { ...x.v, drive: link } } : x)));
      setDriveMsg({ ok: true, text: `Pujat al Drive: ${v.name}` });
    } catch (e) {
      setDriveMsg({ ok: false, text: `No s'ha pogut pujar al Drive: ${e instanceof Error ? e.message : String(e)} Ho pots tornar a provar amb «☁️ Pujar».` });
      if (/connecta|caducat/i.test(String(e))) driveStatus().then(setDrive, () => {});
    } finally {
      release();
      setUp((u) => { const n = { ...u }; delete n[v.id]; return n; });
    }
  }

  useEffect(() => {
    let alive = true;
    listVideos(match.id).then((l) => Promise.all(l.map(withFile))).then((l) => alive && setSaved(l), () => {});
    return () => { alive = false; };
  }, [match.id]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // Escuts: el nostre i el del rival (en un vídeo del rival, «nosaltres» és el rival analitzat).
  const teams = useCrests();
  const crests = match.kind === "rival"
    ? { us: crestFor(teams, match.rival), rival: null }
    : { us: "/escut.png", rival: crestFor(teams, match.rival) };
  const rivalInfo = useRivalCard(match, crestFor(teams, match.rival));
  const rival = withRival ? rivalInfo.card : null;

  // Apartats: sortida, pressió, transicions defensives i ofensives, a destacar (amb tota la resta) i gols. Dins de cada apartat, per temps.
  const sections = useMemo(() => {
    const order = new Map(buttons.map((b) => [b.label, b.sort]));
    const color = new Map(buttons.map((b) => [b.label, b.color]));
    const list = events.filter((e) => team === "all" || e.team === team);
    // Tot el que no és de la llista (xuts, recuperacions, córners…) va a «A destacar»
    const HL = buttons.find((b) => videoRank(b.label) === 4)?.label ?? HIGHLIGHT_BUTTON.label;
    const group = (a: string) => (videoRank(a) >= 4 && videoRank(a) !== 5 ? HL : a);
    const actions = [...new Set(list.map((e) => group(e.action)))].sort(
      (a, b) => videoRank(a) - videoRank(b) || (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b, "ca"),
    );
    return actions.map((a): Section & { key: string } => {
      const evs = list.filter((e) => group(e.action) === a).sort((x, y) => x.t - y.t);
      const c = color.get(a) ?? (a === HL ? HIGHLIGHT_BUTTON.color : evs[0]?.color) ?? "#0a2ea0";
      return {
        key: a,
        title: a,
        sub: `${team === "all" ? "Tots dos equips" : team === "us" ? L.us : L.rival} · ${evs.length} ${evs.length === 1 ? "tall" : "talls"}`,
        color: c,
        clips: evs.map((e): Clip => {
          const v = toVideo(match, e.t);
          const who = [
            team === "all" ? (e.team === "us" ? L.us : L.rival) : null,
            e.player_id ? playerName(e.player_id) : null,
            e.result === "ok" ? "✓" : e.result === "ko" ? "✗" : null,
          ].filter(Boolean).join(" · ");
          return {
            start: Math.max(0, v - Number(e.pre_s)),
            end: v + Number(e.post_s),
            label: `${e.action} · ${minuteOf(match, e.t)}`,
            sub: who || undefined,
            color: c,
            drawing: (e.drawing as Shape[] | null) ?? null,
            drawAt: v,
            team: e.team,
          };
        }),
      };
    });
  }, [events, buttons, team, match, L.us, L.rival, playerName]);

  const base = `${match.title} · ${match.match_date}`;
  const opts = { cards, overlay, drawings, rival };

  async function run(label: string, fileName: string, secs: Section[], o: { intro: boolean; cards: boolean; introSub?: string }) {
    if (!file || job) return;
    setMsg(null);
    setReady(null);
    const ctrl = new AbortController();
    setJob({ label, progress: 0, ctrl });
    const release = await keepAwake();
    const name = `${safeName(fileName)}.mp4`;
    // El vídeo es va escrivint al dispositiu a trossos; si no es pot (navegador sense espai), es fa a la memòria.
    const writer = await createVideoWriter(match.id, name).catch(() => null);
    const font = root.current ? getComputedStyle(root.current).getPropertyValue("--font-escapulada").trim() || "sans-serif" : "sans-serif";
    try {
      const blob = await exportClips(file, secs, {
        intro: o.intro ? { title: match.title, sub: o.introSub ?? `${fmtDate(match.match_date)} · ${secs.reduce((n, s) => n + s.clips.length, 0)} talls` } : null,
        cards: o.cards,
        overlay,
        drawings,
        font,
        crests,
        rival: o.intro ? rival : null,
        signal: ctrl.signal,
        onProgress: (p) => setJob((j) => (j && j.ctrl === ctrl ? { ...j, progress: p } : j)),
        out: writer?.stream,
      });
      let f: File;
      let kept = false;
      if (writer) {
        // Ja és al dispositiu: es posa a «Vídeos fets» encara que surtis de l'app
        const item = await withFile(await writer.finish());
        setSaved((l) => [item, ...l]);
        f = item.file;
        kept = true;
        if (drive?.connected) void toDrive(item.v, item.file); // es puja sol al Drive
      } else f = new File([blob!], name, { type: "video/mp4" });
      // Mòbil/iPad: cal un toc nou per compartir; ordinador: es descarrega directament.
      if (!canShareFile(f)) await deliverFile(f);
      else if (!kept) setReady(f);
      setMsg({ ok: true, text: `Fet: ${f.name} (${mb(f.size)}).${kept ? " Queda guardat a «Vídeos fets»." : ""}` });
    } catch (e) {
      writer?.abort();
      if (e instanceof DOMException && e.name === "AbortError") setMsg({ ok: true, text: "Cancel·lat." });
      else if (typeof file === "string" && !(e instanceof ExportError))
        // Veo no sempre deixa llegir el vídeo des d'una altra web: llavors cal el fitxer.
        setMsg({ ok: false, text: "Veo no deixa retallar aquest vídeo des de l'enllaç. Descarrega el partit de Veo (MP4) i obre'l com a fitxer per fer els talls." });
      else setMsg({ ok: false, text: e instanceof ExportError ? e.message : `No s'ha pogut fer el vídeo: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      release();
      setJob(null);
    }
  }

  const savedList = saved.length > 0 ? (
        <section className="card saved-videos">
          <h3 className="esc" style={{ marginTop: 0 }}>Vídeos fets</h3>
          <ul>
            {saved.map(({ v, file: vf }) => (
              <li key={v.id}>
                <span><b>{v.name.replace(/\.mp4$/, "")}</b><span className="muted small"> · {mb(v.size)} · {new Date(v.created).toLocaleString("ca-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span></span>
                {v.drive ? (
                  <a className="btn small secondary" href={v.drive} target="_blank" rel="noreferrer">☁️ Al Drive</a>
                ) : up[v.id] != null ? (
                  <span className="chip">☁️ {Math.round(up[v.id] * 100)}%</span>
                ) : drive?.connected ? (
                  <button className="btn small secondary" onClick={() => toDrive(v, vf)}>☁️ Pujar</button>
                ) : null}
                <button className="btn small" onClick={() => deliverFile(vf)}>📤 Desar</button>
                <button className="btn small secondary" aria-label={`Esborrar ${v.name}`}
                  onClick={() => { const item = saved.find((x) => x.v.id === v.id)!; deleteWithUndo("Vídeo esborrat", { hide: () => setSaved((l) => l.filter((x) => x.v.id !== v.id)), restore: () => setSaved((l) => [item, ...l].sort((a, b) => b.v.created - a.v.created)), commit: () => deleteVideo(v.id).then(() => {}) }); }}>🗑</button>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ margin: "4px 0 0" }}>Es guarden en aquest dispositiu 3 setmanes. «Desar» obre el menú per guardar-lo a Fotos, Arxius o Google Drive.</p>
        </section>
  ) : null;

  if (match.video_source === "youtube" && !file) {
    return (
      <><section className="card">
        <h3 className="esc" style={{ marginTop: 0 }}>Talls</h3>
        <p className="muted">Els vídeos de YouTube no es poden retallar ni descarregar. Per fer talls, carrega el fitxer del partit (MP4 del Veo o del mòbil).</p>
      </section>
      {savedList}</>
    );
  }
  if (!file) {
    return (
      <><section className="card">
        <h3 className="esc" style={{ marginTop: 0 }}>Talls</h3>
        <p className="muted">Carrega primer el vídeo del partit (a dalt, «Obrir vídeo») per poder descarregar els talls.</p>
      </section>
      {savedList}</>
    );
  }

  const all = sections.reduce((n, s) => n + s.clips.length, 0);
  const busy = !!job;
  return (
    <div ref={root} className="clip-export">
      <section className="card">
        <div className="row between" style={{ gap: 8 }}>
          <h3 className="esc" style={{ margin: 0 }}>Descarregar talls</h3>
          <div className="seg-toggle" role="group" aria-label="Equip">
            {(["us", "rival", "all"] as TeamFilter[]).map((t) => (
              <button key={t} type="button" aria-pressed={team === t} onClick={() => setTeam(t)} disabled={busy}>
                {t === "us" ? L.us : t === "rival" ? L.rival : "Tots"}
              </button>
            ))}
          </div>
        </div>
        <div className="clip-opts">
          <label><input type="checkbox" checked={cards} onChange={(e) => setCards(e.target.checked)} disabled={busy} /> Títol a cada apartat</label>
          <label><input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} disabled={busy} /> Acció i minut a sobre</label>
          <label><input type="checkbox" checked={drawings} onChange={(e) => setDrawings(e.target.checked)} disabled={busy} /> Pausa amb els dibuixos</label>
          {rivalInfo.card && <label><input type="checkbox" checked={withRival} onChange={(e) => setWithRival(e.target.checked)} disabled={busy} /> Fitxa del rival a l&apos;inici</label>}
        </div>
        <RivalPreview info={rivalInfo} on={withRival} />
        <button className="btn block" disabled={busy || all === 0}
          onClick={() => run("Tots junts", `Talls · ${base}`, sections, { intro: true, cards })}>
          ⬇ Tots junts, ordenats per accions ({all} talls · {mmss(totalSeconds(sections, { ...opts, intro: { title: "", sub: "" } }))})
        </button>
        {rival && (
          <button className="btn small secondary" style={{ marginTop: 6 }} disabled={busy}
            onClick={() => run("Fitxa del rival", `Fitxa rival · ${base}`, [], { intro: true, cards: false, introSub: `${fmtDate(match.match_date)} · Fitxa del rival` })}>
            ⬇ Només la fitxa del rival ({mmss(totalSeconds([], { cards: false, drawings: false, intro: { title: "", sub: "" }, rival }))})
          </button>
        )}
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          Es fa al teu dispositiu. Mentre es fa, deixa l&apos;app oberta (la pantalla no s&apos;apagarà). Quan acaba, queda guardat a «Vídeos fets» encara que surtis{drive?.connected ? " i es puja sol al teu Google Drive" : ""}.
        </p>
        {drive?.configured && (
          <div className="drive-row">
            {drive.connected ? (
              <>
                <span>☁️ Google Drive connectat · carpeta «CE Europa · Talls»</span>
                <button className="btn small secondary" disabled={busy}
                  onClick={() => window.confirm("Desconnectar el Google Drive? Els vídeos ja pujats no s'esborren.") && disconnectDrive().then(() => setDrive({ configured: true, connected: false }), (e) => setDriveMsg({ ok: false, text: String(e instanceof Error ? e.message : e) }))}>
                  Desconnectar
                </button>
              </>
            ) : (
              <button className="btn small" disabled={busy} onClick={() => connectDrive().catch((e) => setDriveMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }))}>
                ☁️ Connectar Google Drive
              </button>
            )}
          </div>
        )}
        {driveMsg && <p className={`msg ${driveMsg.ok ? "ok" : "error"}`} role="status"><Ticked text={driveMsg.text} /></p>}

        {job && (
          <div className="clip-progress" role="status">
            <span>Fent «{job.label}»… {Math.round(job.progress * 100)}%</span>
            <progress max={1} value={job.progress} />
            <button className="btn small secondary" onClick={() => job.ctrl.abort()}>Cancel·lar</button>
          </div>
        )}
        {ready && (
          <div className="plan-pdf-ready" role="status">
            <span>Vídeo a punt ({ready.name})</span>
            <button className="btn small" onClick={() => deliverFile(ready).then(() => setReady(null))}>📤 Desar / compartir</button>
            <button className="btn small secondary" onClick={() => setReady(null)} aria-label="Tancar">✕</button>
          </div>
        )}
        {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
      </section>

      {savedList}

      {sections.length === 0 && <p className="card muted">No hi ha accions marcades{team !== "all" ? " d'aquest equip" : ""}.</p>}

      {sections.map((s) => {
        const dur = totalSeconds([s], { ...opts, intro: null });
        return (
          <section key={s.key} className="card clip-section" style={{ borderLeft: `6px solid ${s.color}` }}>
            <div className="row between" style={{ gap: 8, flexWrap: "nowrap" }}>
              <button type="button" className="clip-sec-title" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key}>
                <b className="esc">{s.title}</b>
                <span className="muted small">{s.clips.length} {s.clips.length === 1 ? "tall" : "talls"} · {mmss(dur)} {open === s.key ? "▴" : "▾"}</span>
              </button>
              <button className="btn small" disabled={busy}
                onClick={() => run(s.title, `${s.title} · ${base}`, [s], { intro: false, cards })}>
                ⬇ Apartat
              </button>
            </div>
            {open === s.key && (
              <ul className="clip-list">
                {s.clips.map((c, i) => (
                  <li key={i}>
                    <span><b>{c.label}</b>{c.sub && <span className="muted small"> · {c.sub}</span>}{c.drawing?.length ? " ✏️" : ""}</span>
                    <span className="muted small">{mmss(c.end - c.start)}</span>
                    <button className="btn small secondary" disabled={busy} aria-label={`Descarregar ${c.label}`}
                      onClick={() => run(c.label, `${c.label} · ${base}`, [{ ...s, clips: [c] }], { intro: false, cards: false })}>
                      ⬇
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Resum del rival que sortirà al vídeo (per veure-ho abans de fer-lo). */
function RivalPreview({ info, on }: { info: { card: RivalCard | null; loading: boolean; error: string | null }; on: boolean }) {
  if (info.loading) return <p className="muted small">Carregant la fitxa del rival…</p>;
  if (info.error) return <p className="muted small">No s&apos;ha pogut fer la fitxa del rival: {info.error}</p>;
  const c = info.card;
  if (!c || !on) return null;
  const s = c.s;
  return (
    <div className="rival-prev">
      <b className="esc">Fitxa del rival · {c.name}</b>
      <span>{s.pos ? `${s.pos}a de ${s.teams}` : "Sense classificar"} · {s.pts} punts · {s.pj} PJ · {s.g}-{s.e}-{s.p} · gols {s.gf}:{s.gc}</span>
      {c.last.length > 0 && <span>Últims: {c.last.slice(0, 3).map((g) => `${g.score} (${g.label.replace(/^J\d+ · /, "")})`).join(" · ")}</span>}
      {c.scorers.length > 0 && <span>Golejadores: {c.scorers.map((p) => `${p.name} ${p.goals}`).join(" · ")}</span>}
      {c.scout && <span>+ claus de l&apos;informe del rival</span>}
      <span className="muted small">{rivalPages(c)} pantalles al principi del vídeo amb tots els talls.{s.stale_at ? " (Dades de la FCF guardades i completades amb les actes.)" : ""}</span>
    </div>
  );
}
