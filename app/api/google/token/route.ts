import { ensureFolder, fail, googleConfig, HttpError, refreshAccess, requireCoach } from "@/lib/google-server";
import { adminClient } from "@/lib/server-admin";

// Un permís curt (1 hora) per pujar el vídeo directament del dispositiu al Drive, i la carpeta on va.
export async function POST(req: Request) {
  try {
    const db = adminClient();
    const me = await requireCoach(req, db);
    const cfg = googleConfig();
    if (!cfg) throw new HttpError(503, "Falta configurar Google a Vercel.");
    const { data: link } = await db.from("google_drive_links").select("refresh_token, folder_id").eq("profile_id", me).maybeSingle();
    if (!link) throw new HttpError(409, "Connecta primer el Google Drive.");
    let t;
    try {
      t = await refreshAccess(link.refresh_token, cfg);
    } catch (e) {
      // Permís tret o caducat: s'esborra perquè es pugui tornar a connectar
      if (e instanceof HttpError && e.status === 409) await db.from("google_drive_links").delete().eq("profile_id", me);
      throw e;
    }
    const folder = await ensureFolder(t.access_token!, link.folder_id);
    if (folder !== link.folder_id) await db.from("google_drive_links").update({ folder_id: folder }).eq("profile_id", me);
    return Response.json({ access_token: t.access_token, expires_in: t.expires_in ?? 3600, folder_id: folder }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}
