"use client";

import { useMemo, useRef, useState } from "react";
import type { Shape } from "@/components/telestrator";
import { minuteOf, teamLabels, toVideo, type AButton, type AEvent, type AMatch } from "@/lib/analysis";
import { exportClips, ExportError, totalSeconds, type Clip, type Section } from "@/lib/clip-export";
import { canShareFile, deliverFile, safeName } from "@/lib/share-file";
import { fmtDate } from "@/lib/wellness";

type TeamFilter = "us" | "rival" | "all";
type Job = { label: string; progress: number; ctrl: AbortController };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Descarregar els talls del vídeo: un per un, per apartats (accions) o tots junts. */
export function ClipExport({ match, events, buttons, file, playerName }: {
  match: AMatch; events: AEvent[]; buttons: AButton[]; file: File | null; playerName: (id: string | null) => string;
}) {
  const L = teamLabels(match);
  const [team, setTeam] = useState<TeamFilter>("us");
  const [cards, setCards] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [drawings, setDrawings] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [ready, setReady] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Apartats ordenats com els botons d'etiquetar; dins de cada apartat, per temps.
  const sections = useMemo(() => {
    const order = new Map(buttons.map((b) => [b.label, b.sort]));
    const color = new Map(buttons.map((b) => [b.label, b.color]));
    const list = events.filter((e) => team === "all" || e.team === team);
    const actions = [...new Set(list.map((e) => e.action))].sort(
      (a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b, "ca"),
    );
    return actions.map((a): Section & { key: string } => {
      const evs = list.filter((e) => e.action === a).sort((x, y) => x.t - y.t);
      const c = color.get(a) ?? evs[0]?.color ?? "#0a2ea0";
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
          };
        }),
      };
    });
  }, [events, buttons, team, match, L.us, L.rival, playerName]);

  const base = `${match.title} · ${match.match_date}`;
  const opts = { cards, overlay, drawings };

  async function run(label: string, fileName: string, secs: Section[], o: { intro: boolean; cards: boolean }) {
    if (!file || job) return;
    setMsg(null);
    setReady(null);
    const ctrl = new AbortController();
    setJob({ label, progress: 0, ctrl });
    const font = root.current ? getComputedStyle(root.current).getPropertyValue("--font-escapulada").trim() || "sans-serif" : "sans-serif";
    try {
      const blob = await exportClips(file, secs, {
        intro: o.intro ? { title: match.title, sub: `${fmtDate(match.match_date)} · ${secs.reduce((n, s) => n + s.clips.length, 0)} talls` } : null,
        cards: o.cards,
        overlay,
        drawings,
        font,
        signal: ctrl.signal,
        onProgress: (p) => setJob((j) => (j && j.ctrl === ctrl ? { ...j, progress: p } : j)),
      });
      const f = new File([blob], `${safeName(fileName)}.mp4`, { type: "video/mp4" });
      // Mòbil/iPad: cal un toc nou per compartir; ordinador: es descarrega directament.
      if (canShareFile(f)) setReady(f);
      else await deliverFile(f);
      setMsg({ ok: true, text: `Fet: ${f.name} (${Math.round(f.size / 1e6)} MB).` });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setMsg({ ok: true, text: "Cancel·lat." });
      else setMsg({ ok: false, text: e instanceof ExportError ? e.message : `No s'ha pogut fer el vídeo: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setJob(null);
    }
  }

  if (match.video_source === "youtube" && !file) {
    return (
      <section className="card">
        <h3 className="esc" style={{ marginTop: 0 }}>Talls</h3>
        <p className="muted">Els vídeos de YouTube no es poden retallar ni descarregar. Per fer talls, carrega el fitxer del partit (MP4 del Veo o del mòbil).</p>
      </section>
    );
  }
  if (!file) {
    return (
      <section className="card">
        <h3 className="esc" style={{ marginTop: 0 }}>Talls</h3>
        <p className="muted">Carrega primer el vídeo del partit (a dalt, «Obrir vídeo») per poder descarregar els talls.</p>
      </section>
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
        </div>
        <button className="btn block" disabled={busy || all === 0}
          onClick={() => run("Tots junts", `Talls · ${base}`, sections, { intro: true, cards })}>
          ⬇ Tots junts, ordenats per accions ({all} talls · {mmss(totalSeconds(sections, { ...opts, intro: { title: "", sub: "" } }))})
        </button>
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          Es fa al teu dispositiu (el vídeo no es puja enlloc). Pot trigar una mica: deixa aquesta pantalla oberta.
        </p>

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
