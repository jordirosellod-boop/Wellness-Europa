import type { SupabaseClient } from "@supabase/supabase-js";

// Google Drive (només servidor). Permís «drive.file»: l'app només veu i crea els fitxers que ella mateixa puja.
// GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET es configuren a Vercel (mai al codi).

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const FOLDER_NAME = "CE Europa · Talls";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function googleConfig() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

export const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/google/callback`;

/** Comprova que qui ho demana és staff. Torna el seu id. */
export async function requireCoach(req: Request, db: SupabaseClient): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Cal iniciar sessió.");
  const { data } = await db.auth.getUser(token);
  if (!data.user) throw new HttpError(401, "La sessió ha caducat. Torna a entrar.");
  const { data: me } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (me?.role !== "coach") throw new HttpError(403, "Només el staff.");
  return data.user.id;
}

export const fail = (e: unknown) =>
  Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof HttpError ? e.status : 500 });

async function tokenCall(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok) throw new HttpError(res.status === 400 || res.status === 401 ? 409 : 502, j.error === "invalid_grant" ? "El permís de Google ha caducat o s'ha tret. Torna a connectar el Drive." : `Google: ${j.error_description ?? j.error ?? res.status}`);
  return j;
}

export const exchangeCode = (code: string, req: Request, cfg: { id: string; secret: string }) =>
  tokenCall({ code, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirectUri(req), grant_type: "authorization_code" });

export const refreshAccess = (refresh: string, cfg: { id: string; secret: string }) =>
  tokenCall({ refresh_token: refresh, client_id: cfg.id, client_secret: cfg.secret, grant_type: "refresh_token" });

/** La carpeta «CE Europa · Talls» del Drive (la crea si no hi és o si s'ha esborrat). */
export async function ensureFolder(access: string, known: string | null): Promise<string> {
  const auth = { Authorization: `Bearer ${access}` };
  if (known) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(known)}?fields=id,trashed`, { headers: auth, cache: "no-store" });
    if (r.ok && !((await r.json()) as { trashed?: boolean }).trashed) return known;
  }
  const q = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, { headers: auth, cache: "no-store" });
  const fj = (await found.json().catch(() => ({}))) as { files?: { id: string }[] };
  if (found.ok && fj.files?.[0]) return fj.files[0].id;
  const made = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  const mj = (await made.json().catch(() => ({}))) as { id?: string };
  if (!made.ok || !mj.id) throw new HttpError(502, "No s'ha pogut crear la carpeta al Drive.");
  return mj.id;
}
