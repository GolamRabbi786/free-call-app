/* Free Call — service worker (PWA install + offline support) */
const CACHE = "freecall-v1";
const SHELL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(["/", SHELL, "/manifest.webmanifest", "/logo.svg"]),
      )
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch cross-origin requests (Convex sync, STUN, etc.).
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached app shell (SPA).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  // Static assets are content-hashed: cache first, then network.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        }),
    ),
  );
});

/* ---- Web Push (alerts even when the app is closed) ---- */

self.addEventListener("push", (event) => {
  let data = {
    title: "Free Call",
    body: "You have a new update",
    url: "/dashboard",
  };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (err) {
    /* non-JSON payloads are ignored */
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // If the app is open and focused, the in-app NotificationWatcher
        // already alerts — never double-notify.
        const focused = clients.some(
          (client) =>
            client.focused &&
            new URL(client.url).origin === self.location.origin,
        );
        if (focused) return;
        return self.registration.showNotification(data.title, {
          body: data.body,
          icon: "/logo.svg",
          badge: "/logo.svg",
          tag: `freecall-${Date.now()}`,
          data: { url: data.url },
        });
      }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
