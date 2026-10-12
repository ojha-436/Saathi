/* Saathi service worker: shows web push notifications (FCM data messages) and opens the right conversation on click. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const d = payload.data || payload.notification || payload;
  const title = d.title || "Saathi";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // The open, focused app already shows an in-app toast; don't double-notify.
      if (wins.some((w) => w.focused && w.visibilityState === "visible")) return;
      return self.registration.showNotification(title, {
        body: d.body || "",
        tag: d.tag || "saathi",
        renotify: true,
        icon: "/icon-192.png",
        badge: "/saathi-ai.svg",
        data: { url: d.url || "/app" },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === target.origin) {
          w.postMessage({ type: "saathi-open", url: target.href });
          return w.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
