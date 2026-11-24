// ============================================================
// Espace pro — Horlogerie Haratyk : réception des notifications
// ============================================================
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const titre = d.title || "Horlogerie Haratyk";
  e.waitUntil(self.registration.showNotification(titre, {
    body: d.body || "Du nouveau sur votre espace professionnel.",
    icon: "/assets/favicon.png",
    badge: "/assets/favicon.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: true,           // reste affichée jusqu'au clic (PC)
    data: { url: d.url || "/pro/" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/pro/", self.location.origin).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const pro = fenetres.find(c => new URL(c.url).pathname.startsWith("/pro"));
    if (pro) {
      await pro.focus();
      pro.postMessage({ type: "ouvrir", url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
