"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/** Control comú per a un vídeo del dispositiu o de YouTube. */
export type VideoHandle = {
  time: () => number;
  duration: () => number;
  seek: (s: number) => void;
  play: () => void;
  pause: () => void;
  paused: () => boolean;
  rate: (r: number) => void;
};

type YTPlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (s: number, allow: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
  setPlaybackRate: (r: number) => void;
  destroy: () => void;
};
type YTNamespace = { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer };

let ytReady: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    const w = window as unknown as { YT?: YTNamespace & { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return resolve(w.YT as YTNamespace);
    w.onYouTubeIframeAPIReady = () => resolve(w.YT as YTNamespace);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytReady;
}

type VimeoPlayer = {
  on: (ev: string, cb: (d: { seconds?: number; duration?: number }) => void) => void;
  setCurrentTime: (s: number) => Promise<unknown>;
  play: () => Promise<unknown>;
  pause: () => Promise<unknown>;
  setPlaybackRate: (r: number) => Promise<unknown>;
  getDuration: () => Promise<number>;
  destroy: () => Promise<unknown>;
};
let vimeoReady: Promise<new (el: HTMLElement) => VimeoPlayer> | null = null;
function loadVimeo() {
  vimeoReady ??= new Promise((resolve, reject) => {
    const w = window as unknown as { Vimeo?: { Player: new (el: HTMLElement) => VimeoPlayer } };
    if (w.Vimeo?.Player) return resolve(w.Vimeo.Player);
    const s = document.createElement("script");
    s.src = "https://player.vimeo.com/api/player.js";
    s.onload = () => (w.Vimeo?.Player ? resolve(w.Vimeo.Player) : reject(new Error("Vimeo")));
    s.onerror = () => { vimeoReady = null; reject(new Error("Vimeo")); };
    document.head.appendChild(s);
  });
  return vimeoReady;
}

export type PlayerKind = "file" | "youtube" | "vimeo" | "embed";

/**
 * Reproductor: "src" és un arxiu del dispositiu (blob:) o un enllaç a un fitxer de vídeo, un identificador de YouTube,
 * l'adreça del reproductor de Vimeo o qualsevol altra pàgina (embed: l'app no la pot controlar). El vídeo mai es puja enlloc.
 * onFail: un enllaç que no es pot reproduir com a fitxer (aleshores es prova dins la pàgina).
 */
export const VideoPlayer = forwardRef<VideoHandle, { kind: PlayerKind; src: string; onTick?: (t: number) => void; onFail?: () => void }>(
  function VideoPlayer({ kind, src, onTick, onFail }, ref) {
    const video = useRef<HTMLVideoElement>(null);
    const ytBox = useRef<HTMLDivElement>(null);
    const yt = useRef<YTPlayer | null>(null);
    const [ytError, setYtError] = useState<number | null>(null);
    const vmFrame = useRef<HTMLIFrameElement>(null);
    const vm = useRef<{ p: VimeoPlayer; t: number; d: number; paused: boolean } | null>(null);

    useImperativeHandle(ref, () => ({
      time: () => (kind === "file" ? video.current?.currentTime ?? 0 : kind === "vimeo" ? vm.current?.t ?? 0 : kind === "youtube" ? yt.current?.getCurrentTime?.() ?? 0 : 0),
      duration: () => (kind === "file" ? video.current?.duration || 0 : kind === "vimeo" ? vm.current?.d ?? 0 : kind === "youtube" ? yt.current?.getDuration?.() ?? 0 : 0),
      seek: (s) => {
        const x = Math.max(0, s);
        if (kind === "file") { if (video.current) video.current.currentTime = x; }
        else if (kind === "vimeo") { if (vm.current) { vm.current.t = x; void vm.current.p.setCurrentTime(x).catch(() => {}); } }
        else if (kind === "youtube") yt.current?.seekTo(x, true);
      },
      play: () => { if (kind === "file") void video.current?.play(); else if (kind === "vimeo") void vm.current?.p.play().catch(() => {}); else if (kind === "youtube") yt.current?.playVideo(); },
      pause: () => { if (kind === "file") video.current?.pause(); else if (kind === "vimeo") void vm.current?.p.pause().catch(() => {}); else if (kind === "youtube") yt.current?.pauseVideo(); },
      paused: () => (kind === "file" ? video.current?.paused ?? true : kind === "vimeo" ? vm.current?.paused ?? true : kind === "youtube" ? yt.current?.getPlayerState?.() !== 1 : true),
      rate: (r) => { if (kind === "file") { if (video.current) video.current.playbackRate = r; } else if (kind === "vimeo") void vm.current?.p.setPlaybackRate(r).catch(() => {}); else if (kind === "youtube") yt.current?.setPlaybackRate(r); },
    }), [kind]);

    // Vimeo: el reproductor oficial; el temps arriba amb els seus avisos
    useEffect(() => {
      if (kind !== "vimeo" || !vmFrame.current) return;
      let alive = true;
      const el = vmFrame.current;
      loadVimeo().then((Player) => {
        if (!alive) return;
        const p = new Player(el);
        const st = { p, t: 0, d: 0, paused: true };
        vm.current = st;
        p.on("timeupdate", (d) => { st.t = d.seconds ?? st.t; if (d.duration) st.d = d.duration; });
        p.on("play", () => { st.paused = false; });
        p.on("pause", () => { st.paused = true; });
        p.on("ended", () => { st.paused = true; });
        p.getDuration().then((d) => { st.d = d; }, () => {});
      }, () => {});
      return () => { alive = false; void vm.current?.p.destroy().catch(() => {}); vm.current = null; };
    }, [kind, src]);

    useEffect(() => {
      if (kind !== "youtube" || !ytBox.current) return;
      let alive = true;
      const box = document.createElement("div");
      ytBox.current.appendChild(box);
      loadYouTube().then((YT) => {
        if (!alive) return;
        yt.current = new YT.Player(box, {
          videoId: src,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
          events: { onError: (e: { data: number }) => setYtError(e.data) },
        });
      });
      return () => {
        alive = false;
        yt.current?.destroy?.();
        yt.current = null;
        box.remove();
      };
    }, [kind, src]);

    // Avisa del temps actual unes 4 vegades per segon (per al rellotge i la llista).
    useEffect(() => {
      if (!onTick) return;
      const id = setInterval(() => {
        const t = kind === "file" ? video.current?.currentTime : kind === "vimeo" ? vm.current?.t : kind === "youtube" ? yt.current?.getCurrentTime?.() : undefined;
        if (typeof t === "number") onTick(t);
      }, 250);
      return () => clearInterval(id);
    }, [kind, onTick]);

    if (kind === "vimeo") return (
      <div className="an-video yt">
        <iframe ref={vmFrame} className="an-frame" src={src} title="Vídeo de Vimeo" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      </div>
    );
    if (kind === "embed") return (
      <div className="an-video yt">
        <iframe className="an-frame" src={src} title="Vídeo" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
    return kind === "file" ? (
      <video ref={video} className="an-video" src={src} controls playsInline preload="metadata" onError={onFail} />
    ) : (
      <div className="an-video yt">
        <div ref={ytBox} className="yt-box" />
        {ytError != null && (
          <p className="msg error">
            {ytError === 100 ? "Aquest vídeo de YouTube és privat o s'ha esborrat."
              : ytError === 101 || ytError === 150 ? "Qui ha penjat aquest vídeo no deixa que es miri fora de YouTube. Demana-li que ho permeti (YouTube Studio → vídeo → «Permet la inserció») o que et passi el fitxer."
              : `YouTube no deixa reproduir aquest vídeo aquí (error ${ytError}). Torna-ho a provar; si continua, obre'l a YouTube.`}
          </p>
        )}
      </div>
    );
  },
);
