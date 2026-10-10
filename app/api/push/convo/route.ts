import webpush from "web-push";
import { adminClient, vapidKeys } from "@/lib/server-admin";

// El staff ho crida en publicar una convocatòria: envia un avís a totes les jugadores
// que tenen les notificacions activades. Només el staff (amb la seva sessió).
export async function POST(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat. Torna a entrar." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff pot enviar avisos." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const { data: c, error: cErr } = await db.from("convocations").select("id, rival, match_date, kickoff, published").eq("id", id).maybeSingle();
  if (cErr) return Response.json({ error: cErr.message }, { status: 500 });
  if (!c) return Response.json({ error: "Convocatòria no trobada." }, { status: 404 });
  if (!c.published) return Response.json({ error: "Primer cal publicar la convocatòria." }, { status: 400 });

  const { data: players, error: pErr } = await db.from("profiles").select("id").eq("role", "player");
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });
  const ids = (players ?? []).map((p) => p.id as string);
  const { data: subs, error: sErr } = ids.length
    ? await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("player_id", ids).order("id")
    : { data: [], error: null };
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 });

  const day = new Intl.DateTimeFormat("ca-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${c.match_date}T12:00:00Z`));
  const { publicKey, privateKey } = await vapidKeys(db);
  webpush.setVapidDetails("https://wellness-europa.vercel.app", publicKey, privateKey);
  const payload = JSON.stringify({
    title: "Convocatòria penjada",
    body: `Partit contra ${c.rival} · ${day}${c.kickoff ? ` a les ${String(c.kickoff).slice(0, 5)}` : ""}. Entra a veure-la!`,
    url: "/j?s=convo",
  });

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
  await db.from("convocations").update({ notified_at: new Date().toISOString() }).eq("id", c.id);
  return Response.json({ sent, players: ids.length });
}
