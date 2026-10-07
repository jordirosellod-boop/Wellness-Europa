import { syncFcf } from "@/lib/fcf-sync";
import { adminClient } from "@/lib/server-admin";

export const maxDuration = 60;

// Actualitza les estadístiques de la FCF. La crida la base de dades cada 6 hores (amb la clau
// interna) o el staff amb el botó "Actualitzar ara" (amb la seva sessió).
export async function POST(req: Request) {
  const db = adminClient();
  const given = req.headers.get("x-cron-secret");
  let allowed = false;
  if (given) {
    const { data } = await db.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
    allowed = !!data?.value && data.value === given;
  } else {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await db.auth.getUser(token);
      if (data.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
        allowed = p?.role === "coach";
      }
    }
  }
  if (!allowed) return Response.json({ error: "No autoritzat." }, { status: 401 });
  try {
    return Response.json(await syncFcf(db));
  } catch (e) {
    return Response.json({ error: `No s'ha pogut llegir la web de la FCF: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
