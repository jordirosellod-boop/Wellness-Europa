"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { minuteOf, type AEvent, type AMatch } from "@/lib/analysis";
import { supabase } from "@/lib/supabase";

/** Mode vestidor: a sobre del vídeo, el títol de cada tall, el rètol de sota i els controls (es veuen en moure el ratolí o tocar). */
export function ShowLayer({ show, match, who, onNext, onPrev, onReplay, onToggle, onExit }: {
  show: { list: AEvent[]; i: number; phase: "card" | "play" | "end" }; match: AMatch; who: (e: AEvent) => string;
  onNext: () => void; onPrev: () => void; onReplay: () => void; onToggle: () => void; onExit: () => void;
}) {
  const e = show.list[show.i];
  const n = show.list.length;
  const [hud, setHud] = useState(true);
  const [pokes, setPokes] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setHud(false), 3000);
    return () => clearTimeout(t);
  }, [pokes]);
  const poke = () => { setHud(true); setPokes((x) => x + 1); };
  const by = who(e);
  return (
    <div className={`show-layer${hud || show.phase !== "play" ? " hud" : ""}`} onMouseMove={poke}>
      <button type="button" className="show-zone l" aria-label="Anterior" onClick={onPrev} />
      <button type="button" className="show-zone c" aria-label="Play o pausa" onClick={() => { poke(); onToggle(); }} />
      <button type="button" className="show-zone r" aria-label="Següent" onClick={onNext} />
      {show.phase === "card" && (
        <div className="show-card" style={{ "--c": e.color ?? "#0a2ea0" } as CSSProperties}>
          <span className="show-count">{show.i + 1} / {n}</span>
          <h2>{e.action}</h2>
          <p>{minuteOf(match, e.t)}{by ? ` · ${by}` : ""}{e.result ? (e.result === "ok" ? " · ✓" : " · ✗") : ""}</p>
          {e.notes && <p className="show-note">«{e.notes}»</p>}
          <i className="show-timer" />
        </div>
      )}
      {show.phase !== "card" && (
        <div className="show-lower" style={{ "--c": e.color ?? "#0a2ea0" } as CSSProperties}>
          <b>{e.action}</b><span>{minuteOf(match, e.t)}{by ? ` · ${by}` : ""}</span>{e.notes && <em>{e.notes}</em>}
        </div>
      )}
      {show.phase === "end" && (
        <div className="show-end">
          <button type="button" onClick={onReplay}>↻ Repetir</button>
          {show.i < n - 1 ? <button type="button" className="go" onClick={onNext}>Següent ▶</button> : <button type="button" className="go" onClick={onExit}>Fi ✓</button>}
        </div>
      )}
      <div className="show-bar">
        <span className="show-dots">{show.list.map((x, k) => <i key={x.id} className={k === show.i ? "on" : k < show.i ? "done" : ""} style={{ "--c": x.color ?? "#0a2ea0" } as CSSProperties} />)}</span>
        <span className="show-btns">
          <button type="button" onClick={onPrev} aria-label="Anterior">◀</button>
          <button type="button" onClick={onReplay} aria-label="Repetir">↻</button>
          <button type="button" onClick={onToggle} aria-label="Play o pausa">⏯</button>
          <button type="button" onClick={onNext} aria-label="Següent">▶</button>
          <button type="button" onClick={onExit} aria-label="Sortir">✕</button>
        </span>
      </div>
    </div>
  );
}

/** El mòbil fa de comandament del mode vestidor que hi ha obert a l'ordinador de la tele (mateix partit). */
export function ShowRemote({ matchId, title, onClose }: { matchId: string; title: string; onClose: () => void }) {
  const [st, setSt] = useState<{ i: number; n: number; phase: string; label: string; color: string | null; min: string } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const ch = useRef<ReturnType<ReturnType<typeof supabase>["channel"]> | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setWaiting(true), 4000);
    let c: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
    try {
      c = supabase().channel(`vestidor-${matchId}`, { config: { broadcast: { self: false } } });
      c.on("broadcast", { event: "state" }, ({ payload }) => setSt(payload as never)).subscribe();
      ch.current = c;
    } catch { /* sense connexió: els botons no faran res i es veurà l'avís */ }
    return () => { clearTimeout(t); if (c) void supabase().removeChannel(c); };
  }, [matchId]);
  const send = (c: string) => { void ch.current?.send({ type: "broadcast", event: "cmd", payload: { c } }); try { navigator.vibrate?.(15); } catch { /* res */ } };
  return (
    <div className="remote" role="dialog" aria-label="Comandament del vestidor">
      <div className="row between"><b className="esc">📱 Comandament</b><button type="button" className="btn small secondary" onClick={onClose}>Tancar</button></div>
      <p className="muted small" style={{ margin: "4px 0 12px" }}>{title}</p>
      {st ? (
        <div className="remote-now" style={{ "--c": st.color ?? "#0a2ea0" } as CSSProperties}>
          <span>{st.i + 1} / {st.n}</span><b className="esc">{st.label}</b><small>{st.min} · {st.phase === "card" ? "títol" : st.phase === "play" ? "reproduint" : "acabat"}</small>
        </div>
      ) : (
        <p className="remote-wait">{waiting ? "Obre «📺 Vestidor» en aquest partit a l'ordinador connectat a la tele. Quan comenci, aquí sortirà el tall que s'està veient." : "Connectant…"}</p>
      )}
      <div className="remote-pad">
        <button type="button" onClick={() => send("prev")}>◀</button>
        <button type="button" className="big" onClick={() => send("toggle")}>⏯</button>
        <button type="button" onClick={() => send("next")}>▶</button>
        <button type="button" onClick={() => send("replay")}>↻ Repetir</button>
        <button type="button" onClick={() => send("exit")}>✕ Acabar</button>
      </div>
    </div>
  );
}
