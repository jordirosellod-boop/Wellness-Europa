import { adminClient, pushToPlayers, pushToStaff } from "@/lib/server-admin";

// El staff ho crida en marcar un gol (nostre o del rival) o en acabar el partit, a «Minuts en directe».
// Avisa tot l'equip amb el marcador (i la imatge del marcador, que Android ensenya gran).
export async function POST(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Cal iniciar sessió." }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "La sessió ha caducat. Torna a entrar." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "coach") return Response.json({ error: "Només el staff pot enviar avisos." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { convocation_id?: unknown; kind?: unknown; minute?: unknown; crest?: unknown };
  if (typeof body.convocation_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.convocation_id)) return Response.json({ error: "Falta el partit." }, { status: 400 });
  const kind = body.kind === "them" ? "them" : body.kind === "final" ? "final" : "us";
  const minute = typeof body.minute === "number" && Number.isInteger(body.minute) && body.minute >= 0 && body.minute <= 130 ? body.minute : null;
  const rivalCrest = typeof body.crest === "string" && /^\/api\/fcf\/crest\?[\w=&%.-]{3,300}$/.test(body.crest) ? body.crest : null;

  const { data: c, error } = await db.from("convocations").select("rival, is_home, published, live_us, live_them").eq("id", body.convocation_id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!c?.published) return Response.json({ error: "La convocatòria no està publicada." }, { status: 400 });
  const us = Number(c.live_us ?? 0), them = Number(c.live_them ?? 0);
  const rival = String(c.rival);
  const home = c.is_home ? "CE Europa" : rival, away = c.is_home ? rival : "CE Europa";
  const hs = c.is_home ? us : them, as = c.is_home ? them : us;
  const score = `${home} ${hs} – ${as} ${away}`;
  const origin = new URL(req.url).origin;
  const img = new URL("/api/score-image", origin);
  img.search = new URLSearchParams({ h: home, a: away, hs: String(hs), as: String(as), k: kind === "final" ? "final" : kind === "us" ? "gol" : "joc",
    ...(c.is_home ? { hc: "/escut.png", ...(rivalCrest ? { ac: rivalCrest } : {}) } : { ac: "/escut.png", ...(rivalCrest ? { hc: rivalCrest } : {}) }) }).toString();
  const when = minute != null ? ` · minut ${minute}'` : "";
  const msg = kind === "final"
    ? { title: `🏁 Final: ${score}`, body: us > them ? "Victòria! Molt bé, equip 💙" : us === them ? "Empat. Seguim!" : "Avui no ha pogut ser. Cap amunt, equip!" }
    : kind === "us"
      ? { title: `⚽ GOOOL! ${score}`, body: `Gol del CE Europa${when}. Força Europa!` }
      : { title: `Gol del ${rival} · ${score}`, body: `Encara queda partit${when}. Amunt!` };
  try {
    const payload = { ...msg, url: "/j", image: img.toString(), tag: `marcador-${body.convocation_id}` };
    const r = await pushToPlayers(db, payload);
    const staff = await pushToStaff(db, payload, u.user.id).catch(() => 0);
    return Response.json({ ...r, staff });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
