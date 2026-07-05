const CACHE_NAME = "copy-trader-shell-v5";
const CORE_ASSETS = [
  "./",
  "home.html",
  "dashboard.html",
  "app.html",
  "assets/css/styles.css",
  "assets/js/app.js",
  "manifest.webmanifest",
  "assets/images/copy-trader-mark.png",
  "assets/images/copy-trader-logo.png",
  "assets/images/favicon-32.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
