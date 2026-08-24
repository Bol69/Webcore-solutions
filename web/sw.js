/* TeamSport — service worker : cache de l'app + réception des notifications */

const CACHE = "teamsport-v5";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./vendor/supabase.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord pour les données, cache d'abord pour l'app
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return; // Supabase / CDN : on laisse passer

  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html"))
    )
  );
});

self.addEventListener("push", (e) => {
  let data = { title: "TeamSport", body: "Un pote a fait sa séance 💪" };
  try { data = { ...data, ...e.data.json() }; } catch { /* payload vide */ }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: data.tag || "workout",
      renotify: true,
      data: { url: data.url || "./" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "./", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
