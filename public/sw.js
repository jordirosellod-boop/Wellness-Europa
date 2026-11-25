// Service worker: (1) guarda l'app al mòbil perquè s'obri a l'instant encara que hi hagi poca cobertura,
// (2) mostra els avisos (amb botons) i obre l'app quan es toquen.
// Només es guarda l'app (pàgines i fitxers), MAI les dades (wellness, salut…): les dades sempre venen d'internet.

const STATIC = "static-v1", PAGES = "pages-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isStatic = (u) => u.pathname.startsWith("/_next/static/") || /\.(?:png|webp|jpg|svg|ico|ttf|woff2?)$/i.test(u.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  // Fitxers amb el nom canviant (no canvien mai): del mòbil primer
  if (isStatic(u)) {
    event.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone()).catch(() => {});
      return res;
    }));
    return;
  }
  // Pàgines: si internet respon de pressa, la versió nova; si va lent o no n'hi ha, la guardada (a l'instant)
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const c = await caches.open(PAGES);
      const key = u.origin + u.pathname; // sense ?s= ni #: la mateixa pàgina
      const net = fetch(req).then((res) => { if (res.ok && res.type === "basic") c.put(key, res.clone()).catch(() => {}); return res; });
      const cached = await c.match(key);
      if (!cached) return net;
      const slow = new Promise((ok) => setTimeout(() => ok(null), 1500));
      const first = await Promise.race([net.catch(() => null), slow]);
      return first || cached;
    })());
  }
});


self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  // Avís per a una jugadora (recordatori del wellness, l'RPE…): punt a la icona de l'app fins que l'obri
  const url = data.url || "/j";
  if (url.startsWith("/j") && self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge(typeof data.badge === "number" ? data.badge : 1).catch(() => {});
  event.waitUntil(
    self.registration.showNotification(data.title || "Juvenil C 2026/2027", {
      body: data.body || "Recorda omplir el wellness.",
      icon: "/icon-192.png",
      // A Android, la icona petita de dalt de la pantalla: la silueta de l'escut (només en blanc)
      badge: "/badge-96.png",
      // Imatge gran (Android): p. ex. el marcador amb els dos escuts
      ...(typeof data.image === "string" && data.image.startsWith(self.location.origin + "/api/score-image") ? { image: data.image } : {}),
      // Els avisos del mateix tipus se substitueixen (no s'amunteguen), però tornen a sonar
      tag: data.tag || (data.title || "avis").replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase().slice(0, 40) || "avis",
      renotify: true,
      vibrate: [60, 40, 60],
      timestamp: Date.now(),
      // Botons (Android): p. ex. «📝 Omplir ara»
      ...(Array.isArray(data.actions) && data.actions.length ? { actions: data.actions.slice(0, 2).map((a) => ({ action: String(a.action), title: String(a.title) })) } : {}),
      data: { url: data.url || "/j", actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [] },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const act = event.action && Array.isArray(d.actions) ? d.actions.find((a) => a.action === event.action) : null;
  const url = (act && typeof act.url === "string" && act.url.startsWith("/") ? act.url : d.url) || "/j";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const target = new URL(url, self.location.origin);
      for (const c of list) {
        if (new URL(c.url).pathname === target.pathname && "focus" in c) {
          // Obre l'apartat de l'avís (p. ex. la convocatòria) mantenint l'enllaç personal (#).
          const hash = new URL(c.url).hash;
          return c.focus().then((w) => (w && "navigate" in w ? w.navigate(target.pathname + target.search + hash) : w));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
