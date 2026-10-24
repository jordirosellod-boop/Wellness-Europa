"use client";

import { useEffect, useRef, useState } from "react";
import { crestFor, useCrests } from "@/components/crest";
import { TacticBoard } from "@/components/tactic-board";
import { prettyTeam, rivalKey } from "@/lib/analysis";
import { fetchConvocations, fetchRoster, FORMATION_NAMES } from "@/lib/convo";
import { canShareFile, deliverFile, safeName } from "@/lib/share-file";
import { supabase } from "@/lib/supabase";
import {
  blankScene, buildPlan, formationOf, numbered, rivalSquad, sceneLength, uid,
  type BoardData, type PlanInput, type PlanSection, type Scene, type Squad,
} from "@/lib/tactics";
import { loadImg, sceneImage, scenesVideo, type RenderOpts } from "@/lib/tactics-render";
import { fmtDate, todayMadrid } from "@/lib/wellness";

type BoardRow = { id: string; title: string; rival_key: string | null; match_date: string | null; updated_at: string };
type Ctx = {
  rival: string; rivalRaw: string; matchDate: string; ours: string; theirs: string; ourSquad: Squad; theirSquad: Squad;
  scout: Record<string, string>; keyPlayers: { dorsal: string; name: string; pos: string }[];
  table: PlanInput["table"]; usTable: PlanInput["usTable"]; notes: string[];
};

async function token() {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? "";
}

/** Tot el que sabem del proper partit: rival (FCF), informe del rival i el nostre onze. */
async function loadContext(): Promise<Ctx> {
  const notes: string[] = [];
  const sb = supabase();
  let rivalRaw = "", matchDate = todayMadrid(), table: Ctx["table"] = null, usTable: Ctx["usTable"] = null;
  try {
    const res = await fetch("/api/fcf/rival", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
    const j = await res.json();
    if (res.ok && j.next) {
      rivalRaw = j.next.rival;
      matchDate = j.next.kickoff?.slice(0, 10) ?? matchDate;
      const r = (j.table as { team_id: string; pos: number; pts: number; pj: number; gf: number; gc: number; form: string[] }[]).find((x) => x.team_id === j.next.rival_id);
      const u = (j.table as { team_id: string; pos: number; pts: number; pj: number; gf: number; gc: number }[]).find((x) => x.team_id === j.us_id);
      if (r) table = { pos: r.pos, pts: r.pts, pj: r.pj, gf: r.gf, gc: r.gc, form: r.form };
      if (u) usTable = { pos: u.pos, pts: u.pts, pj: u.pj, gf: u.gf, gc: u.gc };
      if (j.stale_at) notes.push("La FCF no respon: classificació amb les dades guardades i les actes.");
    }
  } catch {
    notes.push("No s'han pogut llegir les dades de la FCF.");
  }
  const rival = rivalRaw ? prettyTeam(rivalRaw) : "Rival";

  // Informe del rival (l'últim que hagis fet d'aquest equip)
  let scout: Record<string, string> = {};
  let keyPlayers: Ctx["keyPlayers"] = [];
  let theirs = "4-4-2";
  if (rivalRaw) {
    const { data } = await sb.from("rival_scouting").select("fields, match_date").eq("rival_key", rivalKey(rival)).order("match_date", { ascending: false }).order("id").range(0, 0);
    const f = (data?.[0]?.fields ?? null) as Record<string, unknown> | null;
    if (f) {
      scout = Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === "string")) as Record<string, string>;
      keyPlayers = (Array.isArray(f.key_players) ? f.key_players : []) as Ctx["keyPlayers"];
      if (typeof f.system === "string" && FORMATION_NAMES.includes(f.system)) theirs = f.system;
    } else notes.push(`Encara no has fet l'informe de ${rival} (Proper rival): el pla serà més general.`);
  }

  // El nostre onze (de la convocatòria del proper partit)
  let ours = "4-4-2";
  let ourSquad: Squad = numbered(ours);
  try {
    const convos = await fetchConvocations(todayMadrid());
    const c = convos[0];
    if (c) {
      const [roster, { data: lu }] = await Promise.all([
        fetchRoster(c.id),
        sb.from("convocation_lineups").select("formation, slots").eq("convocation_id", c.id).maybeSingle(),
      ]);
      const called = roster.filter((r) => r.called).sort((a, b) => (a.dorsal ?? 99) - (b.dorsal ?? 99));
      if (lu?.formation && FORMATION_NAMES.includes(lu.formation)) ours = lu.formation;
      const slots = (lu?.slots ?? {}) as Record<string, string>;
      const used = new Set<string>();
      const spots = formationOf(ours);
      const byId = new Map(roster.map((r) => [r.player_id, r]));
      ourSquad = spots.map((_, i) => {
        const r = slots[String(i)] ? byId.get(slots[String(i)]) : undefined;
        if (r) used.add(r.player_id);
        return r ? { n: String(r.dorsal ?? "?"), name: r.display_name.split(" ")[0] } : { n: "" };
      });
      const rest = called.filter((r) => !used.has(r.player_id));
      ourSquad = ourSquad.map((p, i) => (p.n ? p : rest.length ? (() => { const r = rest.shift()!; return { n: String(r.dorsal ?? "?"), name: r.display_name.split(" ")[0] }; })() : { n: String(i + 1) }));
      if (!lu) notes.push("No hi ha onze inicial a la convocatòria: he posat les convocades per dorsal.");
    } else notes.push("No hi ha cap convocatòria propera: les nostres jugadores surten numerades.");
  } catch {
    notes.push("No s'ha pogut llegir la convocatòria.");
  }
  return { rival, rivalRaw, matchDate, ours, theirs, ourSquad, theirSquad: rivalSquad(theirs, keyPlayers), scout, keyPlayers, table, usTable, notes };
}

async function listBoards(): Promise<BoardRow[]> {
  const { data, error } = await supabase().from("tactic_boards").select("id, title, rival_key, match_date, updated_at").order("updated_at", { ascending: false }).order("id").range(0, 199);
  if (error) throw new Error(error.message);
  return (data ?? []) as BoardRow[];
}

/** Pissarres guardades + generador del pla de partit automàtic. */
export function TacticsHome() {
  const [open, setOpen] = useState<string | null>(null);
  const [list, setList] = useState<BoardRow[] | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<{ ours: string; theirs: string; press: PlanInput["press"]; build: PlanInput["build"]; side: PlanInput["side"] } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([listBoards(), loadContext()]).then(
      ([l, c]) => {
        if (!alive) return;
        setList(l);
        setCtx(c);
        setOpts((o) => o ?? { ours: c.ours, theirs: c.theirs, press: "mitja", build: "mixta", side: "auto" });
      },
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [version]);

  async function create(title: string, data: BoardData, rival?: string, date?: string) {
    setBusy(true);
    setError(null);
    const { data: row, error: e } = await supabase()
      .from("tactic_boards")
      .insert({ title, data, rival_key: rival ? rivalKey(rival) : null, match_date: date ?? null })
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (e || !row) return setError(`No s'ha pogut crear: ${e?.message ?? "torna-ho a provar"}`);
    setOpen(row.id as string);
  }

  function generate() {
    if (!ctx || !opts) return;
    const ourSquad = ctx.ourSquad.length === formationOf(opts.ours).length ? ctx.ourSquad : numbered(opts.ours);
    const data = buildPlan({
      rival: ctx.rival, ours: opts.ours, theirs: opts.theirs, ourSquad, theirSquad: rivalSquad(opts.theirs, ctx.keyPlayers),
      press: opts.press, build: opts.build, side: opts.side, scout: ctx.scout, table: ctx.table, usTable: ctx.usTable,
    });
    create(`Pla de partit · ${ctx.rival}`, data, ctx.rival, ctx.matchDate);
  }

  if (open) return <TacticsEditor id={open} onBack={() => { setOpen(null); setVersion((v) => v + 1); }} />;

  return (
    <div className="tactics">
      <section className="card plan-gen">
        <h3 className="esc" style={{ marginTop: 0 }}>⚡ Pla de partit automàtic{ctx ? ` · ${ctx.rival}` : ""}</h3>
        {!ctx && !error && <p className="muted">Llegint el proper partit, l&apos;informe del rival i l&apos;onze…</p>}
        {ctx && opts && (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>
              Es fa amb l&apos;informe del rival (Proper rival), les dades de la FCF i el teu onze. Tria com vols jugar i et preparo el pla i les pissarres animades.
            </p>
            <div className="plan-gen-grid">
              <label>El nostre sistema
                <select value={opts.ours} onChange={(e) => setOpts({ ...opts, ours: e.target.value })}>{FORMATION_NAMES.map((f) => <option key={f}>{f}</option>)}</select>
              </label>
              <label>Sistema del rival
                <select value={opts.theirs} onChange={(e) => setOpts({ ...opts, theirs: e.target.value })}>{FORMATION_NAMES.map((f) => <option key={f}>{f}</option>)}</select>
              </label>
              <label>Sense pilota
                <select value={opts.press} onChange={(e) => setOpts({ ...opts, press: e.target.value as PlanInput["press"] })}>
                  <option value="alta">Pressió alta</option><option value="mitja">Bloc mig</option><option value="baixa">Bloc baix</option>
                </select>
              </label>
              <label>Sortida de pilota
                <select value={opts.build} onChange={(e) => setOpts({ ...opts, build: e.target.value as PlanInput["build"] })}>
                  <option value="curta">Curta</option><option value="mixta">Mixta</option><option value="llarga">Llarga</option>
                </select>
              </label>
              <label>Per on atacar
                <select value={opts.side} onChange={(e) => setOpts({ ...opts, side: e.target.value as PlanInput["side"] })}>
                  <option value="auto">Automàtic (segons l&apos;informe)</option><option value="esquerra">Banda esquerra</option><option value="dreta">Banda dreta</option><option value="dins">Per dins</option>
                </select>
              </label>
            </div>
            {ctx.notes.length > 0 && <ul className="plan-gen-notes">{ctx.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            <button className="btn block" disabled={busy} onClick={generate}>{busy ? "Preparant…" : "⚡ Generar el pla i les pissarres"}</button>
          </>
        )}
      </section>

      <section className="card">
        <div className="row between">
          <h3 className="esc" style={{ margin: 0 }}>Pissarres</h3>
          <button className="btn small" disabled={busy || !ctx}
            onClick={() => ctx && create("Pissarra", { scenes: [blankScene(ctx.ourSquad, ctx.theirSquad, ctx.ours, ctx.theirs)] })}>
            + Pissarra lliure
          </button>
        </div>
        {error && <p className="msg error">{error}</p>}
        {list?.length === 0 && <p className="muted">Encara no n&apos;has fet cap.</p>}
        <ul className="list">
          {list?.map((b) => (
            <li key={b.id} className="row between">
              <span><b>{b.title}</b> <span className="muted small">· {b.match_date ? fmtDate(b.match_date) : "lliure"} · editada {fmtDate(b.updated_at.slice(0, 10))}</span></span>
              <button className="btn small" onClick={() => setOpen(b.id)}>Obrir</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Editor d'una pissarra: escenes, pla de partit i exportacions. */
function TacticsEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const [row, setRow] = useState<{ title: string; data: BoardData; rival_key: string | null; match_date: string | null } | null>(null);
  const [si, setSi] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(true);
  const [vertical, setVertical] = useState(false);
  const [ready, setReady] = useState<File | null>(null);
  const [tab, setTab] = useState<"board" | "plan">("board");
  const root = useRef<HTMLDivElement>(null);
  const teams = useCrests();

  useEffect(() => {
    supabase().from("tactic_boards").select("title, data, rival_key, match_date").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (error || !data) return setStatus({ ok: false, text: error?.message ?? "No s'ha trobat la pissarra." });
      const d = data as { title: string; data: BoardData; rival_key: string | null; match_date: string | null };
      setRow({ ...d, data: { ...d.data, scenes: d.data.scenes?.length ? d.data.scenes : [blankScene(numbered("4-4-2"), numbered("4-4-2"), "4-4-2", "4-4-2")] } });
    });
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!row) return status ? <p className="msg error">{status.text}</p> : <p className="muted">Carregant…</p>;
  const scenes = row.data.scenes;
  const scene = scenes[Math.min(si, scenes.length - 1)];
  const upd = (data: BoardData, title = row.title) => {
    setRow({ ...row, data, title });
    setDirty(true);
    setStatus(null);
  };
  const setScene = (s: Scene) => upd({ ...row.data, scenes: scenes.map((x) => (x.id === s.id ? s : x)) });

  async function save() {
    if (!row) return;
    setBusy("save");
    const { data, error } = await supabase().from("tactic_boards").update({ title: row.title.trim() || "Pissarra", data: row.data }).eq("id", id).select("id").maybeSingle();
    setBusy(null);
    if (error || !data) return setStatus({ ok: false, text: `No s'ha pogut desar: ${error?.message ?? "torna-ho a provar"}` });
    setDirty(false);
    setStatus({ ok: true, text: "Desat ✓" });
  }

  async function remove() {
    if (!window.confirm("Esborrar aquesta pissarra?")) return;
    const { data, error } = await supabase().from("tactic_boards").delete().eq("id", id).select("id");
    if (error || !data?.length) return setStatus({ ok: false, text: `No s'ha pogut esborrar: ${error?.message ?? ""}` });
    setDirty(false);
    onBack();
  }

  async function renderOpts(): Promise<RenderOpts> {
    const font = root.current ? getComputedStyle(root.current).getPropertyValue("--font-escapulada").trim() || "sans-serif" : "sans-serif";
    await document.fonts.load(`400 40px ${font}`).catch(() => undefined);
    const rival = row?.data.meta?.rival ?? null;
    const [crestUs, crestRival] = await Promise.all([loadImg("/escut.png"), loadImg(rival ? crestFor(teams, rival) : null)]);
    return { font, showNames, crestUs, crestRival, title: row?.title };
  }

  async function exportFile(kind: "png" | "video" | "videoAll" | "pdf") {
    if (!row) return;
    setBusy(kind);
    setStatus(null);
    setReady(null);
    try {
      const o = await renderOpts();
      let file: File;
      if (kind === "png") {
        file = new File([await sceneImage(scene, 0, o)], `${safeName(`${row.title} - ${scene.title}`)}.png`, { type: "image/png" });
      } else if (kind === "pdf") {
        const { planPdf } = await import("@/lib/tactics-pdf");
        file = new File([await planPdf(row.title, row.match_date ? fmtDate(row.match_date) : "", row.data, o)], `${safeName(row.title)}.pdf`, { type: "application/pdf" });
      } else {
        const list = kind === "video" ? [scene] : scenes;
        const blob = await scenesVideo(list, o, (p) => setStatus({ ok: true, text: `Fent el vídeo… ${Math.round(p * 100)}%` }));
        file = new File([blob], `${safeName(kind === "video" ? `${row.title} - ${scene.title}` : row.title)}.mp4`, { type: "video/mp4" });
      }
      if (canShareFile(file)) setReady(file);
      else await deliverFile(file);
      setStatus({ ok: true, text: `Fet: ${file.name}` });
    } catch (e) {
      setStatus({ ok: false, text: `No s'ha pogut fer: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }

  const present = () => {
    const el = root.current?.querySelector(".tb-stage") as HTMLElement | null;
    el?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div ref={root} className="tactics">
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="btn small secondary" onClick={() => (!dirty || window.confirm("Hi ha canvis sense desar. Sortir igualment?")) && onBack()}>← Pissarres</button>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn small secondary" onClick={remove}>Esborrar</button>
        </span>
      </div>
      <div className="plan-savebar">
        <input type="text" className="tb-title" maxLength={120} value={row.title} onChange={(e) => upd(row.data, e.target.value)} aria-label="Títol" />
        <span className={status && !status.ok ? "err" : ""}>{status ? status.text : dirty ? "Canvis sense desar" : "Tot desat"}</span>
        <button className="btn small" disabled={busy === "save" || !dirty} onClick={save}>{busy === "save" ? "Desant…" : "Desar"}</button>
      </div>

      <div className="tabs" style={{ margin: "10px 0" }}>
        <button aria-pressed={tab === "board"} onClick={() => setTab("board")}>Escenes</button>
        <button aria-pressed={tab === "plan"} onClick={() => setTab("plan")}>Pla de partit</button>
      </div>

      {tab === "board" && (
        <>
          <div className="tb-scenes" role="tablist" aria-label="Escenes">
            {scenes.map((s, i) => (
              <button key={s.id} role="tab" aria-selected={s.id === scene.id} onClick={() => setSi(i)}>{s.title}</button>
            ))}
            <button className="add" onClick={() => {
              const base = scene.frames[0];
              const s: Scene = { ...scene, id: uid(), title: `Escena ${scenes.length + 1}`, frames: [{ ...base, id: uid(), shapes: [], note: "" }] };
              upd({ ...row.data, scenes: [...scenes, s] });
              setSi(scenes.length);
            }}>+ Escena</button>
          </div>
          <div className="tb-scene-bar">
            <input type="text" maxLength={60} value={scene.title} aria-label="Nom de l'escena" onChange={(e) => setScene({ ...scene, title: e.target.value })} />
            <select value={scene.view} aria-label="Camp" onChange={(e) => setScene({ ...scene, view: e.target.value as Scene["view"] })}>
              <option value="full">Camp sencer</option><option value="half">Mig camp (atac)</option>
            </select>
            <label className="small"><input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Noms</label>
            <label className="small"><input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} /> Vertical</label>
            <button className="btn small secondary" onClick={present} title="Pantalla completa">⛶</button>
            {scenes.length > 1 && (
              <button className="btn small secondary" onClick={() => {
                if (!window.confirm(`Esborrar l'escena «${scene.title}»?`)) return;
                upd({ ...row.data, scenes: scenes.filter((s) => s.id !== scene.id) });
                setSi(0);
              }}>Esborrar escena</button>
            )}
          </div>
          <TacticBoard key={scene.id} scene={scene} onChange={setScene} showNames={showNames} vertical={vertical} />
        </>
      )}

      {tab === "plan" && <PlanEditor plan={row.data.plan ?? []} onChange={(plan) => upd({ ...row.data, plan })} />}

      <section className="card tb-export">
        <h3 className="esc" style={{ marginTop: 0 }}>Exportar</h3>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small secondary" disabled={!!busy} onClick={() => exportFile("png")}>📷 Imatge</button>
          <button className="btn small secondary" disabled={!!busy || scene.frames.length < 2} onClick={() => exportFile("video")}>🎬 Vídeo d&apos;aquesta escena ({Math.round(sceneLength(scene))} s)</button>
          <button className="btn small secondary" disabled={!!busy} onClick={() => exportFile("videoAll")}>🎬 Vídeo de totes</button>
          <button className="btn small" disabled={!!busy} onClick={() => exportFile("pdf")}>📄 PDF del pla</button>
        </div>
        {ready && (
          <div className="plan-pdf-ready" role="status">
            <span>A punt: {ready.name}</span>
            <button className="btn small" onClick={() => deliverFile(ready).then(() => setReady(null))}>📤 Desar / compartir</button>
            <button className="btn small secondary" onClick={() => setReady(null)} aria-label="Tancar">✕</button>
          </div>
        )}
      </section>
    </div>
  );
}

/** El text del pla de partit, per apartats (editable). */
function PlanEditor({ plan, onChange }: { plan: PlanSection[]; onChange: (p: PlanSection[]) => void }) {
  return (
    <section className="card plan-text">
      {plan.length === 0 && <p className="muted">Aquesta pissarra no té pla de partit. Fes-ne un amb «⚡ Pla de partit automàtic» o afegeix-hi un apartat.</p>}
      {plan.map((sec, i) => (
        <div key={i} className="plan-sec">
          <div className="row between" style={{ flexWrap: "nowrap", gap: 6 }}>
            <input type="text" maxLength={60} value={sec.title} aria-label="Títol de l'apartat" onChange={(e) => onChange(plan.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <button className="btn small secondary" aria-label="Treure l'apartat" onClick={() => onChange(plan.filter((_, j) => j !== i))}>✕</button>
          </div>
          <textarea rows={Math.max(3, sec.lines.length + 1)} maxLength={3000} value={sec.lines.join("\n")}
            onChange={(e) => onChange(plan.map((x, j) => (j === i ? { ...x, lines: e.target.value.split("\n") } : x)))} />
        </div>
      ))}
      <button className="btn small secondary" onClick={() => onChange([...plan, { title: "Apartat nou", lines: [""] }])}>+ Apartat</button>
      <p className="muted small" style={{ marginBottom: 0 }}>Una idea per línia. Surt al PDF del pla.</p>
    </section>
  );
}
