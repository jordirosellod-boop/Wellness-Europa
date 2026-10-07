// Service worker: només mostra els recordatoris i obre l'app quan es toquen.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Juvenil C 2026/2027", {
      body: data.body || "Recorda omplir el wellness.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/j" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/j";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (new URL(c.url).pathname === url && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
