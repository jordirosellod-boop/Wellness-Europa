// Gravar la pestanya de l'app (ordinador: Chrome, Edge o Safari de Mac). A l'iPad/iPhone no es pot: Apple no ho deixa fer a les webs.
// El navegador sempre pregunta abans què es grava (cal triar «aquesta pestanya»).

import { announceVideo, createVideoWriter } from "@/lib/saved-videos";

export const canRecordTab = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined";

export async function startTabRecording(match_id: string, baseName: string) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30, displaySurface: "browser" } as MediaTrackConstraints,
    audio: true,
    // Chrome: proposa directament aquesta pestanya
    ...({ preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude" } as Record<string, unknown>),
  } as DisplayMediaStreamOptions);
  const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  const type = mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  const ext = type === "video/mp4" ? "mp4" : "webm";
  const writer = await createVideoWriter(match_id, `${baseName}.${ext}`, type);
  const w = writer.stream.getWriter();
  let pos = 0, chain = Promise.resolve();
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 5_000_000 });
  // Es va guardant al dispositiu cada pocs segons (no tot a la memòria)
  rec.ondataavailable = (e) => {
    if (!e.data.size) return;
    chain = chain.then(async () => {
      const data = new Uint8Array(await e.data.arrayBuffer());
      await w.write({ type: "write", data, position: pos });
      pos += data.byteLength;
    });
  };
  const stopped = new Promise<void>((ok) => { rec.onstop = () => ok(); });
  rec.start(4000);
  return {
    /** Atura i desa a «Vídeos fets». Torna l'id del vídeo. */
    async stop(): Promise<string> {
      // Primer es desa tot; la captura s'atura al final (alguns navegadors tanquen coses en aturar-la)
      if (rec.state !== "inactive") rec.stop();
      await stopped;
      await chain;
      const v = await writer.finish();
      announceVideo(v.id);
      setTimeout(() => stream.getTracks().forEach((t) => t.stop()), 300);
      return v.id;
    },
    async cancel() {
      if (rec.state !== "inactive") rec.stop();
      stream.getTracks().forEach((t) => t.stop());
      await stopped.catch(() => {});
      await chain.catch(() => {});
      await writer.abort();
    },
    /** Si la persona atura la compartició des del navegador. */
    onEnded(f: () => void) { stream.getVideoTracks()[0]?.addEventListener("ended", f); },
  };
}
