import webpush from "web-push";
import { adminClient, vapidKeys } from "@/lib/server-admin";
import { todayMadrid } from "@/lib/wellness";

// L'executa la base de dades (pg_cron) a les 7:30 de Barcelona els dies d'entrenament.
// Envia el recordatori de wellness a les jugadores que tenen les notificacions activades
// i encara no l'han fet.
export async function POST(req: Request) {
  const db = adminClient();
  const { data: secret } = await db.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
  const given = req.headers.get("x-cron-secret");
  if (!secret?.value || !given || given !== secret.value) {
    return Response.json({ error: "No autoritzat." }, { status: 401 });
  }

  const today = todayMadrid();
  const { data: sessions, error: sErr } = await db
    .from("sessions").select("id").eq("session_date", today).eq("kind", "Entrenament").eq("cancelled", false);
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 });
  if (!sessions?.length) return Response.json({ sent: 0, reason: "Avui no hi ha entrenament." });
  const ids = sessions.map((s) => s.id);

  // Qui ja ha fet el wellness d'avui no rep l'avís.
  const { data: done } = await db.from("wellness").select("player_id").in("session_id", ids);
  const already = new Set((done ?? []).map((w) => w.player_id as string));

  const { data: subs, error: pErr } = await db.from("push_subscriptions").select("id, player_id, endpoint, p256dh, auth").order("id");
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  const { publicKey, privateKey } = await vapidKeys(db);
  webpush.setVapidDetails("https://wellness-europa.vercel.app", publicKey, privateKey);
  const payload = JSON.stringify({
    title: "Juvenil C 2026/2027",
    body: "Bon dia! Avui hi ha entrenament: omple el wellness abans de les 14:00.",
    url: "/j",
  });

  let sent = 0;
  const gone: string[] = [];
  for (const s of subs ?? []) {
    if (already.has(s.player_id)) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(s.id); // el mòbil ja no accepta avisos
    }
  }
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  return Response.json({ sent, removed: gone.length });
}
