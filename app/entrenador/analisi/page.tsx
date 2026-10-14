"use client";

import { Crest } from "@/components/crest";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { MatchReport } from "@/components/analysis-report";
import { AddToCorrection, CorrectionsPanel } from "@/components/corrections";
import { RivalPanel } from "@/components/rival-scout";
import { AnalysisSeason } from "@/components/analysis-season";
import { ClipExport } from "@/components/clip-export";
import { AnalysisStats, ZonePitch, type APlayer } from "@/components/analysis-stats";
import { DrawingEditor, DrawingOverlay, type Shape } from "@/components/telestrator";
import { matchInsights } from "@/lib/analysis-insights";
import { CoachShell, Footer, OwnerOnly } from "@/components/ui";
import { VideoPlayer, type VideoHandle } from "@/components/video-player";
import {
  ABUTTON_COLS, AEVENT_COLS, AMATCH_COLS, DEFAULT_BUTTONS, fetchAEvents, fetchAMatches, fetchButtons, fmtClock, fromVideo, halfOf,
  minuteOf, toVideo, youtubeId, type AButton, type AEvent, type AMatch,
} from "@/lib/analysis";
import { fetchConvocations, fetchRoster } from "@/lib/convo";
import { addDays } from "@/lib/dates";
import { escapulada } from "@/lib/fonts";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, todayMadrid, type Profile } from "@/lib/wellness";

export default function AnalysisPage() {
  return (
    <>
      <CoachShell>{() => <OwnerOnly><Analysis /></OwnerOnly>}</CoachShell>
      <Footer />
    </>
  );
}

function Analysis() {
  const [id, setId] = useState<string | null>(null);
  const [tab, setTab] = useState<HomeTab>("rival"); // es manté en tornar d'un partit
  useEffect(() => {
    const sync = () => setId(new URLSearchParams(window.location.search).get("id"));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const go = (next: string | null) => {
    window.history.pushState(null, "", next ? `?id=${next}` : window.location.pathname);
    setId(next);
    window.scrollTo({ top: 0 });
  };
  return <div className={`an-font ${escapulada.variable}`}>{id ? <Workspace key={id} id={id} onBack={() => go(null)} /> : <AnalysisHome onOpen={go} tab={tab} choose={setTab} />}</div>;
}

type HomeTab = "rival" | "corr" | "own";

/** Inici de l'Anàlisi: proper rival, correccions i els nostres partits. */
function AnalysisHome({ onOpen, tab, choose }: { onOpen: (id: string) => void; tab: HomeTab; choose: (t: HomeTab) => void }) {
  return (
    <>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Anàlisi</h1>
        <span className="chip">Només tu</span>
      </div>
      <div className="tabs an-home-tabs" style={{ margin: "10px 0" }}>
        <button aria-pressed={tab === "rival"} onClick={() => choose("rival")}>Proper rival</button>
        <button aria-pressed={tab === "corr"} onClick={() => choose("corr")}>Correccions</button>
        <button aria-pressed={tab === "own"} onClick={() => choose("own")}>Els nostres partits</button>
      </div>
      {tab === "rival" && <RivalPanel onOpen={onOpen} />}
      {tab === "corr" && <CorrectionsPanel />}
      {tab === "own" && <MatchList onOpen={onOpen} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Llista de partits analitzats i creació
// ---------------------------------------------------------------------------

function MatchList({ onOpen }: { onOpen: (id: string) => void }) {
  const today = todayMadrid();
  const [list, setList] = useState<AMatch[] | null>(null);
  const [convos, setConvos] = useState<Awaited<ReturnType<typeof fetchConvocations>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ convocation_id: "", title: "", match_date: today, rival: "", is_home: true });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"list" | "season">("list");

  useEffect(() => {
    fetchAMatches().then((l) => setList(l.filter((m) => m.kind !== "rival")), (e) => setError(e instanceof Error ? e.message : String(e)));
    fetchConvocations(addDays(today, -120)).then(setConvos, () => {});
  }, [today]);

  function pickConvo(cid: string) {
    const c = convos.find((x) => x.id === cid);
    setF((x) => (c ? { convocation_id: cid, title: c.is_home ? `CE Europa – ${c.rival}` : `${c.rival} – CE Europa`, match_date: c.match_date, rival: c.rival, is_home: c.is_home } : { ...x, convocation_id: "" }));
  }

  async function create() {
    if (!f.title.trim()) return setError("Posa un nom al partit.");
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase()
      .from("analysis_matches")
      .insert({ title: f.title.trim(), match_date: f.match_date, rival: f.rival.trim() || null, is_home: f.is_home, convocation_id: f.convocation_id || null })
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (e || !data) return setError(`No s'ha pogut crear: ${e?.message ?? ""}`);
    onOpen(data.id as string);
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 4 }}>
        Analitza els partits amb el vídeo de Veo o de qualsevol càmera. El vídeo no es puja enlloc: s&apos;obre des del teu dispositiu i aquí només es
        guarden les marques. Ningú més ho veu.
      </p>
      <section className="card stack">
        <h2 className="esc" style={{ margin: 0 }}>Nou partit</h2>
        {convos.length > 0 && (
          <div>
            <label className="field" htmlFor="acv">Des d&apos;una convocatòria (porta les jugadores i els dorsals)</label>
            <select id="acv" value={f.convocation_id} onChange={(e) => pickConvo(e.target.value)}>
              <option value="">— Cap —</option>
              {[...convos].reverse().map((c) => (
                <option key={c.id} value={c.id}>{c.match_date.slice(8, 10)}/{c.match_date.slice(5, 7)} · {c.rival}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="field" htmlFor="atit">Nom</label>
          <input id="atit" type="text" maxLength={120} placeholder="Ex.: J5 · CE Europa – CF Damm" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <div style={{ flex: 1 }}>
            <label className="field" htmlFor="adt">Dia</label>
            <input id="adt" type="date" value={f.match_date} onChange={(e) => setF({ ...f, match_date: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field" htmlFor="arv">Rival</label>
            <input id="arv" type="text" maxLength={80} value={f.rival} onChange={(e) => setF({ ...f, rival: e.target.value })} />
          </div>
        </div>
        <button className="btn block" disabled={busy} onClick={create}>{busy ? "Creant…" : "Crear i començar"}</button>
        {error && <p className="msg error">{error}</p>}
      </section>

      {list && list.length > 0 && (
        <div className="seg-toggle" role="group" aria-label="Vista" style={{ margin: "4px 0 10px" }}>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>Partits</button>
          <button type="button" aria-pressed={view === "season"} onClick={() => setView("season")}>Temporada</button>
        </div>
      )}
      {list && list.length > 0 && view === "season" && <AnalysisSeason matches={list} />}
      {list && list.length > 0 && view === "list" && (
        <section className="card">
          <h2 className="esc">Partits analitzats</h2>
          <ul className="list">
            {list.map((m) => (
              <li key={m.id} className="row between">
                <span className="team-inline" style={{ gap: 10 }}>
                  <Crest name={m.rival} size={30} />
                  <span>
                  <b>{m.title}</b>
                  <span className="muted small"> · {fmtDate(m.match_date)}{m.goals_for != null && m.goals_against != null ? ` · ${m.goals_for}–${m.goals_against}` : ""}</span>
                  </span>
                </span>
                <button className="btn small" onClick={() => onOpen(m.id)}>Obrir</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!list && !error && <p className="muted">Carregant…</p>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Espai de treball: vídeo o directe, panell de botons, llista, estadístiques
// ---------------------------------------------------------------------------

async function fetchPlayers(convocationId: string | null): Promise<APlayer[]> {
  if (convocationId) {
    const r = await fetchRoster(convocationId);
    const called = r.filter((x) => x.called);
    return (called.length ? called : r).map((x) => ({ id: x.player_id, name: x.display_name, dorsal: x.dorsal }));
  }
  const sb = supabase();
  const [ps, nums] = await Promise.all([
    fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").eq("role", "player").order("display_name").order("id").range(f, t)),
    fetchAll<{ profile_id: string; dorsal: number }>((f, t) => sb.from("player_numbers").select("profile_id, dorsal").order("profile_id").range(f, t)),
  ]);
  const d = new Map(nums.map((n) => [n.profile_id, n.dorsal]));
  return ps.map((p) => ({ id: p.id, name: p.display_name, dorsal: d.get(p.id) ?? null }));
}

type Live = { running: boolean; startedAt: number; acc: number };
const liveKey = (id: string) => `an-live-${id}`;
function readLive(id: string): Live {
  try {
    return JSON.parse(localStorage.getItem(liveKey(id)) || "") as Live;
  } catch {
    return { running: false, startedAt: 0, acc: 0 };
  }
}
function writeLive(id: string, l: Live) {
  try {
    localStorage.setItem(liveKey(id), JSON.stringify(l));
  } catch {}
}
const liveNow = (l: Live) => l.acc + (l.running ? (Date.now() - l.startedAt) / 1000 : 0);

function Workspace({ id, onBack }: { id: string; onBack: () => void }) {
  const [match, setMatch] = useState<AMatch | null>(null);
  const [events, setEvents] = useState<AEvent[]>([]);
  const [buttons, setButtons] = useState<AButton[]>([]);
  const [players, setPlayers] = useState<APlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"tag" | "list" | "clips" | "stats" | "report">("tag");
  const [mode, setMode] = useState<"video" | "live">("video");
  const [src, setSrc] = useState<{ kind: "file" | "youtube"; url: string } | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null); // per fer els talls
  const [vt, setVt] = useState(0);
  const [live, setLive] = useState<Live>({ running: false, startedAt: 0, acc: 0 });
  const [, force] = useState(0);
  const [team, setTeam] = useState<"us" | "rival">("us");
  const [detail, setDetail] = useState<string | null>(null);
  const [targetEv, setTargetEv] = useState<string | null>(null);
  const [editButtons, setEditButtons] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [rateV, setRateV] = useState(1);
  const player = useRef<VideoHandle>(null);
  const queue = useRef<{ list: AEvent[]; i: number } | null>(null);
  const [playing, setPlaying] = useState<{ i: number; n: number } | null>(null);
  const [frozen, setFrozen] = useState<Shape[] | null>(null);
  const [drawEdit, setDrawEdit] = useState<AEvent | null>(null);
  const watch = useRef<{ ev: AEvent; shown: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: m, error: e } = await sb.from("analysis_matches").select(AMATCH_COLS).eq("id", id).maybeSingle();
      if (e) return setError(e.message);
      if (!m) return setError("No s'ha trobat el partit (o no és teu).");
      const mm = m as AMatch;
      setMatch(mm);
      const [ev, bt, pl] = await Promise.all([fetchAEvents(id), fetchButtons(), fetchPlayers(mm.convocation_id)]);
      setEvents(ev);
      setPlayers(pl);
      if (bt.length) setButtons(bt);
      else {
        // Primer cop: es crea el panell de botons per defecte.
        const { data: ins, error: be } = await sb.from("analysis_buttons").insert(DEFAULT_BUTTONS).select(ABUTTON_COLS);
        if (be) setError(be.message);
        else setButtons(((ins ?? []) as AButton[]).sort((a, b) => a.sort - b.sort));
      }
      setLive(readLive(id));
      // Ve d'una correcció: anirem al clip quan s'obri el vídeo.
      const evp = new URLSearchParams(window.location.search).get("ev");
      if (evp) {
        setTargetEv(evp);
        setTab("list");
      }
      if (mm.video_source === "youtube" && mm.video_ref) setSrc({ kind: "youtube", url: mm.video_ref });
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  // Rellotge del directe
  useEffect(() => {
    if (mode !== "live" || !live.running) return;
    const t = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [mode, live.running]);

  const onTick = useCallback((t: number) => {
    setVt(t);
    // Si l'acció té un dibuix, el vídeo s'atura uns segons al moment exacte i el mostra.
    const w = watch.current;
    if (w && !w.shown && match && Array.isArray(w.ev.drawing) && w.ev.drawing.length && t >= toVideo(match, w.ev.t)) {
      w.shown = true;
      player.current?.pause();
      setFrozen(w.ev.drawing as Shape[]);
      setTimeout(() => {
        setFrozen(null);
        player.current?.play();
      }, 4000);
    }
    const q = queue.current;
    if (q && match) {
      const e = q.list[q.i];
      if (t >= toVideo(match, e.t) + e.post_s) playIndex(q.i + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  function playIndex(i: number) {
    const q = queue.current;
    if (!q || !match) return;
    if (i >= q.list.length) {
      queue.current = null;
      setPlaying(null);
      player.current?.pause();
      return;
    }
    q.i = i;
    setPlaying({ i, n: q.list.length });
    const e = q.list[i];
    watch.current = { ev: e, shown: false };
    setFrozen(null);
    player.current?.seek(toVideo(match, e.t) - e.pre_s);
    player.current?.play();
  }

  /** Desa canvis del partit; només actualitza la pantalla si el servidor ho confirma. */
  async function saveMatch(patch: Partial<AMatch>, okText?: string) {
    if (!match) return;
    const { data, error: e } = await supabase().from("analysis_matches").update(patch).eq("id", match.id).select(AMATCH_COLS).maybeSingle();
    if (e || !data) return setMsg({ ok: false, text: `No s'ha pogut desar: ${e?.message ?? ""}` });
    setMatch(data as AMatch);
    if (okText) setMsg({ ok: true, text: okText });
  }

  if (error) return (<><p className="msg error">{error}</p><button className="btn small secondary" onClick={onBack}>← Partits</button></>);
  if (!match) return <p className="muted">Carregant…</p>;

  const clock = mode === "live" ? liveNow(live) : fromVideo(match, vt);
  const name = (pid: string | null) => {
    const p = players.find((x) => x.id === pid);
    return p ? `${p.dorsal != null ? p.dorsal + " " : ""}${p.name}` : "";
  };

  async function tag(b: AButton) {
    if (!match) return;
    const t = Math.round(clock * 100) / 100;
    const { data, error: e } = await supabase()
      .from("analysis_events")
      .insert({ match_id: match.id, t, pre_s: b.pre_s, post_s: b.post_s, action: b.label, category: b.category, color: b.color, team })
      .select(AEVENT_COLS)
      .maybeSingle();
    if (e || !data) return setMsg({ ok: false, text: `No s'ha pogut marcar: ${e?.message ?? ""}` });
    const ev = { ...(data as AEvent), t: Number((data as AEvent).t) };
    setEvents((x) => [...x, ev].sort((a, b2) => a.t - b2.t));
    setMsg({ ok: true, text: `${b.label} · ${minuteOf(match, t)} ✓` });
    if ((b.ask_player && match.kind !== "rival") || b.ask_result || b.ask_zone) setDetail(ev.id);
  }

  async function updEvent(eid: string, patch: Partial<AEvent>) {
    const { data, error: e } = await supabase().from("analysis_events").update(patch).eq("id", eid).select(AEVENT_COLS).maybeSingle();
    if (e || !data) return setMsg({ ok: false, text: `No s'ha pogut desar: ${e?.message ?? ""}` });
    const ev = data as AEvent;
    setEvents((x) => x.map((y) => (y.id === eid ? { ...ev, t: Number(ev.t), zx: ev.zx == null ? null : Number(ev.zx), zy: ev.zy == null ? null : Number(ev.zy) } : y)).sort((a, b) => a.t - b.t));
  }

  async function delEvent(eid: string) {
    const { data, error: e } = await supabase().from("analysis_events").delete().eq("id", eid).select("id");
    if (e || !data?.length) return setMsg({ ok: false, text: `No s'ha pogut esborrar: ${e?.message ?? ""}` });
    setEvents((x) => x.filter((y) => y.id !== eid));
    if (detail === eid) setDetail(null);
  }

  function openFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (src?.kind === "file") URL.revokeObjectURL(src.url);
    setSrc({ kind: "file", url: URL.createObjectURL(f) });
    setVideoFile(f);
    setMode("video");
    if (match?.video_ref !== f.name || match?.video_source !== "file") saveMatch({ video_source: "file", video_ref: f.name });
  }

  function openYoutube() {
    const yid = youtubeId(ytUrl);
    if (!yid) return setMsg({ ok: false, text: "Aquest enllaç de YouTube no és vàlid." });
    setSrc({ kind: "youtube", url: yid });
    setVideoFile(null);
    setMode("video");
    saveMatch({ video_source: "youtube", video_ref: yid });
  }

  // Marques d'inici de cada part (sincronitza el directe amb el vídeo).
  function markHalf(h: 1 | 2) {
    if (!match) return;
    if (mode === "live") {
      const c = Math.round(liveNow(live) * 100) / 100;
      return h === 1 ? saveMatch({ h1_start: c }, "Inici de la 1a part marcat.") : saveMatch({ h2_start: c }, "Inici de la 2a part marcat.");
    }
    const v = Math.round((player.current?.time() ?? 0) * 100) / 100;
    if (h === 1) return saveMatch({ video_offset: Math.round((v - Number(match.h1_start)) * 100) / 100 }, "Inici de la 1a part sincronitzat amb el vídeo.");
    if (match.h2_start != null && events.some((e) => e.t >= Number(match.h2_start!)))
      return saveMatch({ video_offset_h2: Math.round((v - Number(match.h2_start)) * 100) / 100 }, "Inici de la 2a part sincronitzat amb el vídeo.");
    return saveMatch({ h2_start: Math.round((v - Number(match.video_offset)) * 100) / 100, video_offset_h2: null }, "Inici de la 2a part marcat.");
  }

  function liveCtl(action: "start" | "pause" | "reset") {
    const now = Date.now();
    const next: Live =
      action === "start" ? { running: true, startedAt: now, acc: live.acc } :
      action === "pause" ? { running: false, startedAt: 0, acc: liveNow(live) } :
      { running: false, startedAt: 0, acc: 0 };
    if (action === "reset" && !window.confirm("Posar el rellotge a zero?")) return;
    setLive(next);
    writeLive(match!.id, next);
  }

  const seek = (e: AEvent) => {
    if (!src || mode !== "video" || !match) return;
    queue.current = null;
    setPlaying(null);
    watch.current = { ev: e, shown: false };
    setFrozen(null);
    player.current?.seek(toVideo(match, e.t) - e.pre_s);
    player.current?.play();
  };

  // Dibuixar sobre el vídeo: va al moment de l'acció, l'atura i obre la pissarra.
  const startDraw = (e: AEvent) => {
    if (!src || mode !== "video" || !match) return setMsg({ ok: false, text: "Per dibuixar, primer obre el vídeo." });
    queue.current = null;
    setPlaying(null);
    watch.current = null;
    player.current?.pause();
    player.current?.seek(toVideo(match, e.t));
    setDetail(null);
    setDrawEdit(e);
  };

  const detailEv = events.find((e) => e.id === detail) ?? null;
  const target = targetEv ? events.find((e) => e.id === targetEv) ?? null : null;

  return (
    <div className="analysis">
      <div className="row between">
        <button className="btn small secondary" onClick={onBack}>← Partits</button>
        <span className="row" style={{ gap: 6 }}>
          <ScoreBox match={match} onSave={(gf, ga) => saveMatch({ goals_for: gf, goals_against: ga }, "Resultat desat.")} />
        </span>
      </div>
      <h1 className="esc team-inline" style={{ margin: "8px 0 4px", fontSize: "1.6rem", gap: 10 }}><Crest name={match.rival} size={40} />{match.title}</h1>
      <p className="muted small" style={{ marginTop: 0 }}>{fmtDate(match.match_date)}</p>

      <div className="seg-toggle" role="group" aria-label="Mode" style={{ marginBottom: 8 }}>
        <button type="button" aria-pressed={mode === "video"} onClick={() => setMode("video")}>🎬 Vídeo</button>
        <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>⏱ Directe</button>
      </div>

      <div className="an-layout">
        <div className="an-left">
          {mode === "video" ? (
            <section className="card an-video-card">
              {!src ? (
                <div className="stack">
                  <label className="btn block" style={{ display: "flex" }}>
                    📂 Obrir el vídeo del dispositiu
                    <input type="file" accept="video/*" onChange={openFile} hidden />
                  </label>
                  {match.video_source === "file" && match.video_ref && (
                    <p className="muted small" style={{ margin: 0 }}>L&apos;últim cop vas fer servir «{match.video_ref}». Torna&apos;l a obrir (el vídeo no es guarda a l&apos;app).</p>
                  )}
                  <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                    <input type="text" placeholder="…o enganxa un enllaç de YouTube" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} />
                    <button className="btn small" onClick={openYoutube}>Obrir</button>
                  </div>
                  <p className="muted small" style={{ margin: 0 }}>De Veo: descarrega el partit (MP4) des de l&apos;app o la web de Veo i obre&apos;l aquí.</p>
                </div>
              ) : (
                <>
                  <div className="an-stage">
                    <VideoPlayer ref={player} kind={src.kind} src={src.url} onTick={onTick} />
                    {frozen && !drawEdit && <DrawingOverlay shapes={frozen} />}
                    {drawEdit && (
                      <DrawingEditor
                        initial={(Array.isArray(drawEdit.drawing) ? drawEdit.drawing : []) as Shape[]}
                        onCancel={() => setDrawEdit(null)}
                        onSave={async (sh) => {
                          await updEvent(drawEdit.id, { drawing: sh.length ? sh : null });
                          setDrawEdit(null);
                          setMsg({ ok: true, text: sh.length ? "Dibuix desat: es mostrarà en reproduir aquesta acció." : "Dibuix esborrat." });
                        }}
                      />
                    )}
                  </div>
                  <div className="an-controls">
                    <button onClick={() => player.current?.seek((player.current?.time() ?? 0) - 10)} aria-label="Enrere 10 segons">−10</button>
                    <button onClick={() => player.current?.seek((player.current?.time() ?? 0) - 3)} aria-label="Enrere 3 segons">−3</button>
                    <button className="main" onClick={() => (player.current?.paused() ? player.current?.play() : player.current?.pause())} aria-label="Play o pausa">⏯</button>
                    <button onClick={() => player.current?.seek((player.current?.time() ?? 0) + 3)} aria-label="Endavant 3 segons">+3</button>
                    <button onClick={() => player.current?.seek((player.current?.time() ?? 0) + 10)} aria-label="Endavant 10 segons">+10</button>
                    <select aria-label="Velocitat" value={rateV} onChange={(e) => { const r = Number(e.target.value); setRateV(r); player.current?.rate(r); }}>
                      {[0.25, 0.5, 1, 1.5, 2].map((r) => <option key={r} value={r}>{r}x</option>)}
                    </select>
                    <label className="an-small-link">
                      Canviar
                      <input type="file" accept="video/*" onChange={openFile} hidden />
                    </label>
                  </div>
                  {playing && (
                    <div className="an-playing">
                      ▶ Clip {playing.i + 1} de {playing.n}
                      <button onClick={() => playIndex(playing.i + 1)}>Següent ⏭</button>
                      <button onClick={() => { queue.current = null; setPlaying(null); player.current?.pause(); }}>Aturar</button>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="card an-live">
              <div className="an-clock esc">{fmtClock(liveNow(live))}</div>
              <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                {live.running ? <button className="btn" onClick={() => liveCtl("pause")}>⏸ Pausa</button> : <button className="btn" onClick={() => liveCtl("start")}>▶ {live.acc ? "Continuar" : "Començar"}</button>}
                <button className="btn secondary" onClick={() => liveCtl("reset")}>Zero</button>
              </div>
              <p className="muted small center" style={{ marginBottom: 0 }}>
                Toca «Començar» al xiulet inicial. Després, amb el vídeo, marca «Inici 1a part» al mateix moment i tot quadrarà.
              </p>
            </section>
          )}

          <div className="an-clockbar">
            <span className="esc">{minuteOf(match, clock)} · {halfOf(match, clock)}a part</span>
            <span className="muted small">{fmtClock(clock)}</span>
            <span className="row" style={{ gap: 4 }}>
              <button className="btn small secondary" onClick={() => markHalf(1)}>Inici 1a part</button>
              <button className="btn small secondary" onClick={() => markHalf(2)}>Inici 2a part</button>
            </span>
          </div>
          {msg && <p className={`msg ${msg.ok ? "ok" : "error"} an-msg`} role="status">{msg.text}</p>}
          {target && (
            <p className="msg info an-msg">
              Clip de la correcció: {target.action} · {minuteOf(match, target.t)}.{" "}
              {src && mode === "video" ? (
                <button className="btn small" onClick={() => { seek(target); setTargetEv(null); }}>▶ Veure&apos;l</button>
              ) : (
                "Obre el vídeo per veure'l."
              )}
            </p>
          )}
          <Timeline match={match} events={events} now={clock} onSeek={seek} />
        </div>

        <div className="an-right">
          <div className="tabs" style={{ marginBottom: 8 }}>
            <button aria-pressed={tab === "tag"} onClick={() => setTab("tag")}>Etiquetar</button>
            <button aria-pressed={tab === "list"} onClick={() => setTab("list")}>Accions ({events.length})</button>
            <button aria-pressed={tab === "clips"} onClick={() => setTab("clips")}>Talls</button>
            <button aria-pressed={tab === "stats"} onClick={() => setTab("stats")}>Estadístiques</button>
            <button aria-pressed={tab === "report"} onClick={() => setTab("report")}>Informe</button>
          </div>

          {tab === "tag" && (
            <section className="card">
              <div className="row between" style={{ marginBottom: 8 }}>
                <div className="seg-toggle" role="group" aria-label="Equip">
                  <button type="button" aria-pressed={team === "us"} onClick={() => setTeam("us")}>{match.kind === "rival" ? match.rival || "Rival" : "CE Europa"}</button>
                  <button type="button" aria-pressed={team === "rival"} onClick={() => setTeam("rival")}>{match.kind === "rival" ? "Contrari" : match.rival || "Rival"}</button>
                </div>
                <button className="btn small secondary" onClick={() => setEditButtons((v) => !v)}>{editButtons ? "Fet" : "Editar botons"}</button>
              </div>
              {editButtons ? (
                <ButtonEditor buttons={buttons} onChange={setButtons} onMsg={setMsg} />
              ) : (
                <div className={`tag-grid${team === "rival" ? " rival" : ""}`}>
                  {buttons.map((b) => (
                    <button key={b.id} type="button" className="tag-btn esc" style={{ "--c": b.color } as CSSProperties} onClick={() => tag(b)}>
                      {b.label}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "list" && (
            <EventList
              match={match}
              events={events}
              players={players}
              name={name}
              canPlay={!!src && mode === "video"}
              onSeek={seek}
              onEdit={setDetail}
              onDelete={delEvent}
              onPlayAll={(list) => {
                if (!list.length) return;
                queue.current = { list, i: 0 };
                playIndex(0);
              }}
            />
          )}

          {tab === "clips" && (
            <ClipExport match={match} events={events} buttons={buttons} file={videoFile} playerName={(pid) => (pid ? name(pid) : "")} />
          )}

          {tab === "stats" && (
            <>
              <Insights match={match} events={events} name={(pid) => name(pid)} />
              <AnalysisStats match={match} events={events} players={players} />
            </>
          )}

          {tab === "report" && (
            <>
              <section className="card no-print">
                <label className="field" htmlFor="anotes">Notes de l&apos;entrenador (surten a l&apos;informe)</label>
                <textarea id="anotes" maxLength={2000} defaultValue={match.notes ?? ""} onBlur={(e) => e.target.value !== (match.notes ?? "") && saveMatch({ notes: e.target.value || null }, "Notes desades.")} />
                <button className="btn block" style={{ marginTop: 8 }} onClick={() => window.print()}>🖨 Desar en PDF / Imprimir</button>
                <p className="muted small" style={{ marginBottom: 0 }}>Per enviar-lo, tria «Desa com a PDF».</p>
              </section>
              <MatchReport match={match} events={events} players={players} />
            </>
          )}
        </div>
      </div>

      {detailEv && (
        <EventDetail
          ev={detailEv}
          match={match}
          players={players}
          button={buttons.find((b) => b.label === detailEv.action)}
          onChange={(p) => updEvent(detailEv.id, p)}
          onDelete={() => delEvent(detailEv.id)}
          onClose={() => setDetail(null)}
          onDraw={() => startDraw(detailEv)}
          canDraw={!!src && mode === "video"}
        />
      )}
    </div>
  );
}

function ScoreBox({ match, onSave }: { match: AMatch; onSave: (gf: number | null, ga: number | null) => void }) {
  const [gf, setGf] = useState(match.goals_for?.toString() ?? "");
  const [ga, setGa] = useState(match.goals_against?.toString() ?? "");
  const n = (s: string) => (s.trim() === "" ? null : Math.min(99, Math.max(0, Number(s) || 0)));
  return (
    <span className="score-box" title="Resultat">
      <input aria-label="Gols a favor" inputMode="numeric" maxLength={2} value={gf} onChange={(e) => setGf(e.target.value.replace(/\D/g, ""))} onBlur={() => onSave(n(gf), n(ga))} />
      <b>–</b>
      <input aria-label="Gols en contra" inputMode="numeric" maxLength={2} value={ga} onChange={(e) => setGa(e.target.value.replace(/\D/g, ""))} onBlur={() => onSave(n(gf), n(ga))} />
    </span>
  );
}

/** Línia de temps del partit amb totes les accions (toca per anar-hi). */
function Timeline({ match, events, now, onSeek }: { match: AMatch; events: AEvent[]; now: number; onSeek: (e: AEvent) => void }) {
  const end = Math.max(now, ...events.map((e) => e.t), match.h2_start != null ? Number(match.h2_start) + 45 * 60 : 45 * 60, 60);
  return (
    <div className="an-timeline" aria-label="Línia de temps">
      {match.h2_start != null && <i className="half" style={{ left: `${(Number(match.h2_start) / end) * 100}%` }} title="Inici 2a part" />}
      <i className="now" style={{ left: `${Math.min(100, (now / end) * 100)}%` }} />
      {events.map((e) => (
        <button
          key={e.id}
          className={`mk ${e.team}`}
          style={{ left: `${(e.t / end) * 100}%`, background: e.color ?? "#0a2ea0" }}
          title={`${minuteOf(match, e.t)} · ${e.action}`}
          aria-label={`${minuteOf(match, e.t)} ${e.action}`}
          onClick={() => onSeek(e)}
        />
      ))}
    </div>
  );
}

function EventList({ match, events, players, name, canPlay, onSeek, onEdit, onDelete, onPlayAll }: {
  match: AMatch; events: AEvent[]; players: APlayer[]; name: (pid: string | null) => string; canPlay: boolean;
  onSeek: (e: AEvent) => void; onEdit: (id: string) => void; onDelete: (id: string) => void; onPlayAll: (l: AEvent[]) => void;
}) {
  const [fa, setFa] = useState("");
  const [ft, setFt] = useState("");
  const [fp, setFp] = useState("");
  const [fh, setFh] = useState("");
  const [fr, setFr] = useState("");
  const actions = useMemo(() => [...new Set(events.map((e) => e.action))], [events]);
  const list = events.filter(
    (e) => (!fa || e.action === fa) && (!ft || e.team === ft) && (!fp || e.player_id === fp) && (!fh || String(halfOf(match, e.t)) === fh) && (!fr || e.result === fr),
  );
  return (
    <section className="card">
      <div className="an-filters">
        <select value={fa} onChange={(e) => setFa(e.target.value)} aria-label="Acció"><option value="">Acció</option>{actions.map((a) => <option key={a}>{a}</option>)}</select>
        <select value={ft} onChange={(e) => setFt(e.target.value)} aria-label="Equip"><option value="">Equip</option><option value="us">CE Europa</option><option value="rival">Rival</option></select>
        <select value={fp} onChange={(e) => setFp(e.target.value)} aria-label="Jugadora"><option value="">Jugadora</option>{players.map((p) => <option key={p.id} value={p.id}>{p.dorsal != null ? `${p.dorsal} ` : ""}{p.name}</option>)}</select>
        <select value={fh} onChange={(e) => setFh(e.target.value)} aria-label="Part"><option value="">Part</option><option value="1">1a part</option><option value="2">2a part</option></select>
        <select value={fr} onChange={(e) => setFr(e.target.value)} aria-label="Resultat"><option value="">Resultat</option><option value="ok">✓ Bé</option><option value="ko">✗ Malament</option></select>
      </div>
      <button className="btn block" disabled={!canPlay || list.length === 0} onClick={() => onPlayAll(list)} style={{ margin: "8px 0" }}>
        ▶ Reproduir {list.length === events.length ? "totes" : "les filtrades"} ({list.length})
      </button>
      {!canPlay && <p className="muted small" style={{ marginTop: 0 }}>Obre el vídeo per veure els clips.</p>}
      {list.length === 0 ? (
        <p className="muted">Cap acció.</p>
      ) : (
        <ul className="an-events">
          {list.map((e) => (
            <li key={e.id}>
              <button className="an-ev" onClick={() => onSeek(e)} disabled={!canPlay}>
                <span className="esc min">{minuteOf(match, e.t)}</span>
                <span className="act" style={{ background: e.color ?? "#0a2ea0" }}>{e.action}</span>
                <span className="who">{e.team === "rival" ? (match.rival || "Rival") : name(e.player_id) || "CE Europa"}</span>
                {e.result && <span className={`res ${e.result}`}>{e.result === "ok" ? "✓" : "✗"}</span>}
              </button>
              <button className="an-ic" onClick={() => onEdit(e.id)} aria-label="Editar">✎</button>
              <button className="an-ic" onClick={() => window.confirm("Esborrar aquesta acció?") && onDelete(e.id)} aria-label="Esborrar">🗑</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Detall d'una acció: jugadora, resultat, zona i notes. Cada canvi es desa al moment. */
function EventDetail({ ev, match, players, button, onChange, onDelete, onClose, onDraw, canDraw }: {
  ev: AEvent; match: AMatch; players: APlayer[]; button?: AButton; onChange: (p: Partial<AEvent>) => void; onDelete: () => void; onClose: () => void;
  onDraw: () => void; canDraw: boolean;
}) {
  const [notes, setNotes] = useState(ev.notes ?? "");
  const showPlayer = ev.team === "us" && match.kind !== "rival" && (button?.ask_player ?? true);
  const [corr, setCorr] = useState<string | null>(null);
  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker an-detail" role="dialog" aria-label={`Detall: ${ev.action}`} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <b className="esc" style={{ fontSize: "1.2rem" }}>
            <span className="dotc" style={{ background: ev.color ?? "#0a2ea0" }} /> {ev.action} · {minuteOf(match, ev.t)} · {ev.team === "us" ? "CE Europa" : match.rival || "Rival"}
          </b>
          <button className="btn small" onClick={onClose}>Fet</button>
        </div>
        {showPlayer && (
          <>
            <label className="field" style={{ marginTop: 8 }}>Jugadora</label>
            <div className="an-players">
              {players.map((p) => (
                <button key={p.id} type="button" className="esc" aria-pressed={ev.player_id === p.id} onClick={() => onChange({ player_id: ev.player_id === p.id ? null : p.id })}>
                  <b>{p.dorsal ?? "·"}</b> {p.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </>
        )}
        <label className="field" style={{ marginTop: 8 }}>Resultat</label>
        <div className="seg-toggle" role="group" aria-label="Resultat">
          <button type="button" aria-pressed={ev.result === "ok"} onClick={() => onChange({ result: ev.result === "ok" ? null : "ok" })}>✓ Bé</button>
          <button type="button" aria-pressed={ev.result === "ko"} onClick={() => onChange({ result: ev.result === "ko" ? null : "ko" })}>✗ Malament</button>
        </div>
        <label className="field" style={{ marginTop: 8 }}>Zona (toca el camp · atacant cap a la dreta)</label>
        <ZonePitch points={ev.zx != null ? [{ x: ev.zx, y: ev.zy!, color: ev.color ?? "#0a2ea0" }] : []} onPick={(x, y) => onChange({ zx: x, zy: y })} height={160} />
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "nowrap" }}>
          <input type="text" maxLength={500} placeholder="Nota (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (ev.notes ?? "") && onChange({ notes: notes || null })} />
          <button className="btn small secondary" onClick={() => window.confirm("Esborrar aquesta acció?") && onDelete()}>Esborrar</button>
        </div>
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <button className="btn small" disabled={!canDraw} onClick={onDraw}>
            ✏️ {Array.isArray(ev.drawing) && ev.drawing.length ? "Editar el dibuix" : "Dibuixar sobre el vídeo"}
          </button>
          {!canDraw && <span className="muted small">Obre el vídeo per dibuixar.</span>}
          {match.kind !== "rival" && <button className="btn small secondary" onClick={() => setCorr(corr === null ? "" : null)}>➕ Afegir a correccions</button>}
        </div>
        {corr !== null && (corr ? <p className="msg ok">{corr}</p> : <AddToCorrection ev={ev} onDone={setCorr} />)}
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <span className="muted small">Clip: </span>
          <label className="small">abans <input type="number" min={0} max={120} value={ev.pre_s} onChange={(e) => onChange({ pre_s: Math.min(120, Math.max(0, Number(e.target.value) || 0)) })} style={{ width: 64 }} /> s</label>
          <label className="small">després <input type="number" min={0} max={120} value={ev.post_s} onChange={(e) => onChange({ post_s: Math.min(120, Math.max(0, Number(e.target.value) || 0)) })} style={{ width: 64 }} /> s</label>
        </div>
      </div>
    </div>
  );
}

/** Editar el panell: nom, color, categoria, segons i què es pregunta en marcar. */
function ButtonEditor({ buttons, onChange, onMsg }: { buttons: AButton[]; onChange: (b: AButton[]) => void; onMsg: (m: { ok: boolean; text: string }) => void }) {
  async function upd(b: AButton, patch: Partial<AButton>) {
    const { data, error } = await supabase().from("analysis_buttons").update(patch).eq("id", b.id).select(ABUTTON_COLS).maybeSingle();
    if (error || !data) return onMsg({ ok: false, text: `No s'ha pogut desar el botó: ${error?.message ?? ""}` });
    onChange(buttons.map((x) => (x.id === b.id ? (data as AButton) : x)));
  }
  async function add() {
    const { data, error } = await supabase().from("analysis_buttons")
      .insert({ label: "Nova acció", color: "#0a2ea0", sort: (buttons.at(-1)?.sort ?? 0) + 1 }).select(ABUTTON_COLS).maybeSingle();
    if (error || !data) return onMsg({ ok: false, text: `No s'ha pogut afegir: ${error?.message ?? ""}` });
    onChange([...buttons, data as AButton]);
  }
  async function del(b: AButton) {
    if (!window.confirm(`Treure el botó «${b.label}»? (Les accions ja marcades es queden.)`)) return;
    const { data, error } = await supabase().from("analysis_buttons").delete().eq("id", b.id).select("id");
    if (error || !data?.length) return onMsg({ ok: false, text: `No s'ha pogut treure: ${error?.message ?? ""}` });
    onChange(buttons.filter((x) => x.id !== b.id));
  }
  return (
    <div className="btn-editor">
      {buttons.map((b) => (
        <div key={b.id} className="be-row">
          <input type="color" value={b.color} onChange={(e) => upd(b, { color: e.target.value })} aria-label={`Color de ${b.label}`} />
          <input type="text" defaultValue={b.label} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value !== b.label && upd(b, { label: e.target.value.trim() })} aria-label="Nom" />
          <label className="small">−<input type="number" min={0} max={120} defaultValue={b.pre_s} onBlur={(e) => upd(b, { pre_s: Math.min(120, Math.max(0, Number(e.target.value) || 0)) })} aria-label="Segons abans" />s</label>
          <label className="small">+<input type="number" min={0} max={120} defaultValue={b.post_s} onBlur={(e) => upd(b, { post_s: Math.min(120, Math.max(0, Number(e.target.value) || 0)) })} aria-label="Segons després" />s</label>
          <label className="small"><input type="checkbox" checked={b.ask_player} onChange={(e) => upd(b, { ask_player: e.target.checked })} /> jug.</label>
          <label className="small"><input type="checkbox" checked={b.ask_result} onChange={(e) => upd(b, { ask_result: e.target.checked })} /> ✓/✗</label>
          <label className="small"><input type="checkbox" checked={b.ask_zone} onChange={(e) => upd(b, { ask_zone: e.target.checked })} /> zona</label>
          <button className="an-ic" onClick={() => del(b)} aria-label={`Treure ${b.label}`}>🗑</button>
        </div>
      ))}
      <button className="btn small" onClick={add}>+ Afegir botó</button>
      <p className="muted small" style={{ marginBottom: 0 }}>«−» i «+» són els segons del clip abans i després del moment marcat. Si marques «jug.», «✓/✗» o «zona», en marcar l&apos;acció et preguntarà la jugadora, el resultat o la zona.</p>
    </div>
  );
}

/** Conclusions automàtiques del partit (a partir de les marques). */
function Insights({ match, events, name }: { match: AMatch; events: AEvent[]; name: (pid: string) => string }) {
  const list = matchInsights(match, events, name);
  return (
    <section className="card">
      <h3 className="esc" style={{ marginTop: 0 }}>Conclusions automàtiques</h3>
      <ul className="rp-insights">
        {list.map((i, k) => <li key={k} className={i.tone}>{i.text}</li>)}
      </ul>
    </section>
  );
}
