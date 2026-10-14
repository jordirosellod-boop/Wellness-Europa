import { CREST_BASE, isCrestFile } from "@/lib/fcf";

// Escut d'un equip, servit des de l'app (així es pot fer servir als PDF i als vídeos sense problemes).
export async function GET(req: Request) {
  const f = new URL(req.url).searchParams.get("f") ?? "";
  if (!isCrestFile(f)) return new Response("Escut no vàlid", { status: 400 });
  const res = await fetch(CREST_BASE + f, { headers: { "User-Agent": "Mozilla/5.0 (compatible; WellnessCEEuropa/1.0)" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) return new Response("No trobat", { status: 404 });
  const body = await res.arrayBuffer();
  if (body.byteLength > 2_000_000) return new Response("Massa gran", { status: 413 });
  return new Response(body, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=2592000, s-maxage=2592000, immutable" },
  });
}
