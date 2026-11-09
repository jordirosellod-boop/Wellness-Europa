import { CREST_BASE, isCrestFile } from "@/lib/fcf";
import { adminClient } from "@/lib/server-admin";

// Escut d'un equip, servit des de l'app (així es pot fer servir als PDF i als vídeos sense problemes).
//  ?f=<fitxer>  l'escut de la FCF (files.fcf.cat)
//  ?c=<id>      un escut pujat pel staff (taula team_crests)
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const c = q.get("c");
  if (c != null) return uploaded(c);
  const f = q.get("f") ?? "";
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

async function uploaded(id: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Escut no vàlid", { status: 400 });
  const { data, error } = await adminClient().from("team_crests").select("image").eq("id", id).maybeSingle();
  if (error) return new Response("Error", { status: 502 });
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec((data?.image as string | null) ?? "");
  if (!m) return new Response("No trobat", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    // L'adreça porta la data de l'últim canvi (?v=), així es pot guardar molt de temps
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=2592000, s-maxage=2592000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
