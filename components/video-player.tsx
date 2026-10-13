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

/**
 * Reproductor: "src" és un arxiu del dispositiu (blob:) o un identificador de YouTube.
 * El vídeo mai es puja enlloc.
 */
export const VideoPlayer = forwardRef<VideoHandle, { kind: "file" | "youtube"; src: string; onTick?: (t: number) => void }>(
  function VideoPlayer({ kind, src, onTick }, ref) {
    const video = useRef<HTMLVideoElement>(null);
    const ytBox = useRef<HTMLDivElement>(null);
    const yt = useRef<YTPlayer | null>(null);
    const [ytError, setYtError] = useState(false);

    useImperativeHandle(ref, () => ({
      time: () => (kind === "file" ? video.current?.currentTime ?? 0 : yt.current?.getCurrentTime?.() ?? 0),
      duration: () => (kind === "file" ? video.current?.duration || 0 : yt.current?.getDuration?.() ?? 0),
      seek: (s) => (kind === "file" ? video.current && (video.current.currentTime = Math.max(0, s)) : yt.current?.seekTo(Math.max(0, s), true)),
      play: () => (kind === "file" ? void video.current?.play() : yt.current?.playVideo()),
      pause: () => (kind === "file" ? video.current?.pause() : yt.current?.pauseVideo()),
      paused: () => (kind === "file" ? video.current?.paused ?? true : yt.current?.getPlayerState?.() !== 1),
      rate: (r) => (kind === "file" ? video.current && (video.current.playbackRate = r) : yt.current?.setPlaybackRate(r)),
    }), [kind]);

    useEffect(() => {
      if (kind !== "youtube" || !ytBox.current) return;
      let alive = true;
      const box = document.createElement("div");
      ytBox.current.appendChild(box);
      loadYouTube().then((YT) => {
        if (!alive) return;
        yt.current = new YT.Player(box, {
          videoId: src,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: { onError: () => setYtError(true) },
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
        const t = kind === "file" ? video.current?.currentTime : yt.current?.getCurrentTime?.();
        if (typeof t === "number") onTick(t);
      }, 250);
      return () => clearInterval(id);
    }, [kind, onTick]);

    return kind === "file" ? (
      <video ref={video} className="an-video" src={src} controls playsInline preload="metadata" />
    ) : (
      <div className="an-video yt">
        <div ref={ytBox} className="yt-box" />
        {ytError && <p className="msg error">No s&apos;ha pogut obrir aquest vídeo de YouTube (pot ser privat o no permetre&apos;s incrustar).</p>}
      </div>
    );
  },
);
