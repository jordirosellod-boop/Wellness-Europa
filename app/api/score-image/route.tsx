import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { CREST_BASE, isCrestFile } from "@/lib/fcf";
import { adminClient } from "@/lib/server-admin";

// Imatge del marcador per a les notificacions (Android la mostra gran): els dos escuts i el resultat.
// Només noms d'equip i números (cap dada personal). Els escuts han de ser de l'app.
const okCrest = (s: string | null) => (s && (s === "/escut.png" || /^\/api\/fcf\/crest\?[\w=&%.-]{3,300}$/.test(s)) ? s : null);
const clean = (s: string | null) => (s ?? "").replace(/[^\p{L}\p{N} .,'’·-]/gu, "").slice(0, 32);
const num = (s: string | null) => { const n = Number(s); return Number.isInteger(n) && n >= 0 && n <= 40 ? n : null; };

/** L'escut com a dades dins la imatge (sense que el generador hagi d'anar a buscar res a cap adreça). */
async function crestData(src: string | null): Promise<string | null> {
  if (!src) return null;
  try {
    if (src === "/escut.png") return `data:image/png;base64,${(await readFile(join(process.cwd(), "public/escut.png"))).toString("base64")}`;
    const q = new URLSearchParams(src.split("?")[1] ?? "");
    const f = q.get("f"), c = q.get("c");
    if (f && isCrestFile(f)) {
      const r = await fetch(CREST_BASE + f, { headers: { "User-Agent": "Mozilla/5.0 (compatible; WellnessCEEuropa/1.0)" } });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !/^image\/(png|jpeg|gif|webp)$/.test(type)) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.byteLength < 1_500_000 ? `data:${type};base64,${buf.toString("base64")}` : null;
    }
    if (c && /^[0-9a-f-]{36}$/i.test(c)) {
      const { data } = await adminClient().from("team_crests").select("image").eq("id", c).maybeSingle();
      const img = (data?.image as string | null) ?? null;
      return img && /^data:image\/(png|jpeg|webp);base64,/.test(img) ? img : null;
    }
  } catch { /* sense escut: les inicials */ }
  return null;
}

export async function GET(req: Request) {
  const u = new URL(req.url), q = u.searchParams;
  const home = clean(q.get("h")), away = clean(q.get("a"));
  const hs = num(q.get("hs")), as = num(q.get("as"));
  if (!home || !away || hs == null || as == null) return new Response("Falten dades", { status: 400 });
  const kind = q.get("k") === "final" ? "FINAL" : q.get("k") === "gol" ? "GOL!" : "EN JOC";
  const [hc, ac] = await Promise.all([crestData(okCrest(q.get("hc"))), crestData(okCrest(q.get("ac")))]);
  const font = await readFile(join(process.cwd(), "app/fonts/Escapulada.ttf"));
  const crest = (src: string | null, name: string) => src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} width={170} height={170} style={{ objectFit: "contain" }} alt="" />
    : <div style={{ width: 170, height: 170, borderRadius: 999, background: "#e8ecf7", color: "#0b1846", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>{name.slice(0, 2).toUpperCase()}</div>;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "Esc",
        background: "radial-gradient(70% 60% at 50% 0%, #2a55d0 0%, #0a1f63 55%, #050f36 100%)" }}>
        <div style={{ display: "flex", fontSize: 44, letterSpacing: 6, color: "#f6d77a", marginBottom: 18 }}>{kind}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 46 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 260 }}>{crest(hc, home)}<div style={{ fontSize: 34, marginTop: 12, textAlign: "center" }}>{home.toUpperCase()}</div></div>
          <div style={{ display: "flex", fontSize: 150, lineHeight: 1 }}>{hs}<span style={{ color: "#f6d77a", margin: "0 18px" }}>–</span>{as}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 260 }}>{crest(ac, away)}<div style={{ fontSize: 34, marginTop: 12, textAlign: "center" }}>{away.toUpperCase()}</div></div>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 28, letterSpacing: 4, color: "rgba(255,255,255,.7)" }}>CE EUROPA · JUVENIL C</div>
      </div>
    ),
    { width: 1200, height: 600, fonts: [{ name: "Esc", data: font, style: "normal", weight: 400 }], headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
