import { adminClient, vapidKeys } from "@/lib/server-admin";

// Clau pública per activar les notificacions al mòbil (és pública per disseny).
export async function GET() {
  try {
    const { publicKey } = await vapidKeys(adminClient());
    return Response.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
