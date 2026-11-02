import { randomBytes } from "node:crypto";
import { DRIVE_SCOPE, fail, googleConfig, redirectUri, requireCoach } from "@/lib/google-server";
import { adminClient } from "@/lib/server-admin";

// Connectar / desconnectar el Google Drive del staff (per pujar-hi els vídeos de talls).

/** Si està configurat i si aquesta persona ja l'ha connectat. */
export async function GET(req: Request) {
  try {
    const db = adminClient();
    const me = await requireCoach(req, db);
    if (!googleConfig()) return Response.json({ configured: false, connected: false });
    const { data } = await db.from("google_drive_links").select("profile_id").eq("profile_id", me).maybeSingle();
    return Response.json({ configured: true, connected: !!data });
  } catch (e) {
    return fail(e);
  }
}

/** Comença la connexió: torna l'adreça de Google on s'ha d'anar a donar permís. */
export async function POST(req: Request) {
  try {
    const db = adminClient();
    const me = await requireCoach(req, db);
    const cfg = googleConfig();
    if (!cfg) return Response.json({ error: "Falta configurar Google a Vercel (GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET)." }, { status: 503 });
    const body = (await req.json().catch(() => ({}))) as { back?: string };
    const back = typeof body.back === "string" && /^\/entrenador\/[^\s]{0,280}$/.test(body.back) ? body.back : null;
    const state = randomBytes(32).toString("hex");
    await db.from("oauth_states").delete().lt("expires_at", new Date().toISOString());
    const { error } = await db.from("oauth_states").insert({ state, profile_id: me, back, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (error) throw new Error(error.message);
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: cfg.id, redirect_uri: redirectUri(req), response_type: "code", scope: DRIVE_SCOPE,
      access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
    }).toString();
    return Response.json({ url: u.toString() });
  } catch (e) {
    return fail(e);
  }
}

/** Desconnectar: es treu el permís a Google i s'esborra. */
export async function DELETE(req: Request) {
  try {
    const db = adminClient();
    const me = await requireCoach(req, db);
    const { data } = await db.from("google_drive_links").select("refresh_token").eq("profile_id", me).maybeSingle();
    if (data?.refresh_token) {
      await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: data.refresh_token }) }).catch(() => {});
    }
    await db.from("google_drive_links").delete().eq("profile_id", me);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
