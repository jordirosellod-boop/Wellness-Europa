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
