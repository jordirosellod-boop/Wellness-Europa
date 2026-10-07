import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// Accions que necessiten la clau secreta (crear/esborrar comptes).
// S'executen NOMÉS al servidor, i només si qui les demana és staff.

const PLAYER_EMAIL_DOMAIN = "jugadores.ce-europa.invalid"; // correu intern inventat: mai s'hi envia res

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) throw new HttpError(500, "Falta configurar SUPABASE_SECRET_KEY al servidor.");
  if (secret.startsWith("sb_publishable_") || secret === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    throw new HttpError(500, "SUPABASE_SECRET_KEY té la clau pública: cal posar-hi la Secret key (sb_secret_...).");
  if (secret.startsWith("eyJ")) {
    // Clau antiga en format JWT: ha de ser la "service_role", no la "anon".
    let role = "";
    try {
      role = JSON.parse(Buffer.from(secret.split(".")[1], "base64url").toString("utf8")).role ?? "";
    } catch {}
    if (role !== "service_role")
      throw new HttpError(500, `SUPABASE_SECRET_KEY és una clau "${role || "desconeguda"}": cal posar-hi la Secret key (sb_secret_...).`);
  }
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function newLinkKey(email: string, token: string): string {
  return Buffer.from(`${email} ${token}`, "utf8").toString("base64url");
}

function cleanName(v: unknown): string {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (s.length < 1 || s.length > 60) throw new HttpError(400, "El nom ha de tenir entre 1 i 60 caràcters.");
  return s;
}

async function requireCoach(req: Request, db: SupabaseClient): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Cal iniciar sessió.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "La sessió ha caducat. Torna a entrar.");
  const { data: profile, error: pErr } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (pErr) throw new HttpError(500, `No s'ha pogut comprovar el rol (revisa SUPABASE_SECRET_KEY a Vercel): ${pErr.message}`);
  if (profile?.role !== "coach") throw new HttpError(403, "Només el staff pot fer això.");
  return data.user.id;
}

async function roleOf(db: SupabaseClient, id: unknown): Promise<string | null> {
  if (typeof id !== "string") return null;
  const { data } = await db.from("profiles").select("role").eq("id", id).maybeSingle();
  return data?.role ?? null;
}

async function createAccount(
  db: SupabaseClient,
  opts: { email: string; password: string; role: "coach" | "player"; name: string },
): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    app_metadata: { role: opts.role },
  });
  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already|exists|registered/i.test(msg)) throw new HttpError(409, "Ja hi ha un compte amb aquest correu.");
    throw new HttpError(400, `No s'ha pogut crear el compte: ${msg}`);
  }
  const id = data.user.id;
  const { error: pErr } = await db.from("profiles").insert({ id, role: opts.role, display_name: opts.name });
  if (pErr) {
    await db.auth.admin.deleteUser(id); // desfà-ho tot si falla a mitges
    throw new HttpError(500, `No s'ha pogut crear el perfil: ${pErr.message}`);
  }
  return id;
}

export async function POST(req: Request) {
  try {
    const db = adminClient();
    const me = await requireCoach(req, db);
    const body = await req.json().catch(() => ({}));

    switch (body.action) {
      case "createPlayer": {
        const name = cleanName(body.name);
        const email = `j-${randomBytes(8).toString("hex")}@${PLAYER_EMAIL_DOMAIN}`;
        const token = randomBytes(24).toString("base64url");
        const id = await createAccount(db, { email, password: token, role: "player", name });
        const link_key = newLinkKey(email, token);
        const { error } = await db.from("player_links").insert({ player_id: id, link_key });
        if (error) {
          await db.auth.admin.deleteUser(id);
          throw new HttpError(500, `No s'ha pogut crear l'enllaç: ${error.message}`);
        }
        return Response.json({ id, link_key });
      }

      case "regenerateLink": {
        if ((await roleOf(db, body.playerId)) !== "player") throw new HttpError(404, "Jugadora no trobada.");
        const { data: u, error: uErr } = await db.auth.admin.getUserById(body.playerId);
        if (uErr || !u.user?.email) throw new HttpError(404, "Jugadora no trobada.");
        const token = randomBytes(24).toString("base64url");
        const { error } = await db.auth.admin.updateUserById(body.playerId, { password: token });
        if (error) throw new HttpError(500, `No s'ha pogut canviar l'enllaç: ${error.message}`);
        // Tanca les sessions obertes amb l'enllaç antic.
        const { error: rErr } = await db.rpc("revoke_user_sessions", { uid: body.playerId });
        if (rErr) throw new HttpError(500, `No s'han pogut tancar les sessions antigues: ${rErr.message}`);
        const link_key = newLinkKey(u.user.email, token);
        const { error: lErr } = await db
          .from("player_links")
          .upsert({ player_id: body.playerId, link_key, updated_at: new Date().toISOString() });
        if (lErr) throw new HttpError(500, `No s'ha pogut desar l'enllaç nou: ${lErr.message}`);
        return Response.json({ link_key });
      }

      case "deletePlayer": {
        if ((await roleOf(db, body.playerId)) !== "player") throw new HttpError(404, "Jugadora no trobada.");
        const { error } = await db.auth.admin.deleteUser(body.playerId);
        if (error) throw new HttpError(500, `No s'ha pogut esborrar: ${error.message}`);
        return Response.json({ ok: true });
      }

      case "createStaff": {
        const name = cleanName(body.name);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "El correu no és vàlid.");
        const password = typeof body.password === "string" ? body.password : "";
        if (password.length < 8) throw new HttpError(400, "La contrasenya ha de tenir com a mínim 8 caràcters.");
        const id = await createAccount(db, { email, password, role: "coach", name });
        return Response.json({ id });
      }

      case "deleteStaff": {
        if (body.staffId === me) throw new HttpError(400, "No et pots esborrar a tu mateix.");
        if ((await roleOf(db, body.staffId)) !== "coach") throw new HttpError(404, "Membre del staff no trobat.");
        const { error } = await db.auth.admin.deleteUser(body.staffId);
        if (error) throw new HttpError(500, `No s'ha pogut esborrar: ${error.message}`);
        return Response.json({ ok: true });
      }

      default:
        throw new HttpError(400, "Acció desconeguda.");
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Error desconegut.";
    return Response.json({ error: message }, { status });
  }
}
