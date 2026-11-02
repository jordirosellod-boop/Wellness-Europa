import { exchangeCode, googleConfig } from "@/lib/google-server";
import { adminClient } from "@/lib/server-admin";

// Tornada de Google després de donar (o no) permís al Drive.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const go = (path: string, result: string) => {
    const to = new URL(path, url.origin);
    to.searchParams.set("drive", result);
    return Response.redirect(to.toString(), 303);
  };
  if (!/^[0-9a-f]{64}$/.test(state)) return go("/entrenador/analisi", "error");
  const db = adminClient();
  const { data: st } = await db.from("oauth_states").select("profile_id, back, expires_at").eq("state", state).maybeSingle();
  await db.from("oauth_states").delete().eq("state", state);
  const back = st?.back ?? "/entrenador/analisi";
  if (!st || new Date(st.expires_at).getTime() < Date.now()) return go(back, "error");
  const cfg = googleConfig();
  if (!code || !cfg) return go(back, url.searchParams.get("error") === "access_denied" ? "no" : "error");
  try {
    const t = await exchangeCode(code, req, cfg);
    if (!t.refresh_token) return go(back, "error");
    const { error } = await db.from("google_drive_links").upsert({ profile_id: st.profile_id, refresh_token: t.refresh_token, folder_id: null });
    if (error) throw new Error(error.message);
    return go(back, "ok");
  } catch {
    return go(back, "error");
  }
}
