// Service worker: només mostra els recordatoris i obre l'app quan es toquen.
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
      // Els avisos del mateix tipus se substitueixen (no s'amunteguen), però tornen a sonar
      tag: data.tag || (data.title || "avis").replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase().slice(0, 40) || "avis",
      renotify: true,
      vibrate: [60, 40, 60],
      timestamp: Date.now(),
      data: { url: data.url || "/j" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/j";
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
