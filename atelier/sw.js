// ============================================================
// Atelier — Horlogerie Haratyk : réception des notifications
// ============================================================
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Horlogerie Haratyk", {
    body: d.body || "Du nouveau à l'atelier.",
    icon: "/assets/favicon.png",
    badge: "/assets/favicon.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: true,
    data: { url: d.url || "/atelier/" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/atelier/", self.location.origin).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const atelier = fenetres.find(c => new URL(c.url).pathname.startsWith("/atelier"));
    if (atelier) {
      await atelier.focus();
      atelier.postMessage({ type: "ouvrir", url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
