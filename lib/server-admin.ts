import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Només per a codi de servidor (rutes /api): fa servir la clau secreta.
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) throw new Error("Falta configurar SUPABASE_SECRET_KEY al servidor.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Envia un avís a totes les jugadores que tenen les notificacions activades.
 * Esborra les subscripcions que ja no existeixen. Torna quants mòbils l'han rebut.
 */
export async function pushToPlayers(db: SupabaseClient, msg: { title: string; body: string; url: string }): Promise<{ sent: number; players: number }> {
  const { data: players, error: pErr } = await db.from("profiles").select("id").eq("role", "player");
  if (pErr) throw new Error(pErr.message);
  const ids = (players ?? []).map((p) => p.id as string);
  const { data: subs, error: sErr } = ids.length
    ? await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("player_id", ids).order("id")
    : { data: [], error: null };
  if (sErr) throw new Error(sErr.message);
  const { publicKey, privateKey } = await vapidKeys(db);
  webpush.setVapidDetails("https://wellness-europa.vercel.app", publicKey, privateKey);
  const payload = JSON.stringify(msg);
  let sent = 0;
  const gone: string[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(s.id);
    }
  }
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  return { sent, players: ids.length };
}

/**
 * Claus de les notificacions (VAPID). Es generen soles la primera vegada i es guarden a la
 * taula privada app_secrets, així no cal configurar res a Vercel.
 */
export async function vapidKeys(db: SupabaseClient): Promise<{ publicKey: string; privateKey: string }> {
  const read = async () => {
    const { data, error } = await db.from("app_secrets").select("name, value").in("name", ["vapid_public", "vapid_private"]);
    if (error) throw new Error(error.message);
    const m = new Map((data ?? []).map((r) => [r.name as string, r.value as string]));
    return m.get("vapid_public") && m.get("vapid_private") ? { publicKey: m.get("vapid_public")!, privateKey: m.get("vapid_private")! } : null;
  };
  const existing = await read();
  if (existing) return existing;
  const keys = webpush.generateVAPIDKeys();
  // "ignoreDuplicates": si dues peticions arriben alhora, es queda la primera parella.
  const { error } = await db.from("app_secrets").upsert(
    [
      { name: "vapid_public", value: keys.publicKey },
      { name: "vapid_private", value: keys.privateKey },
    ],
    { onConflict: "name", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  const saved = await read();
  if (!saved) throw new Error("No s'han pogut desar les claus de notificacions.");
  return saved;
}
