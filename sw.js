// ─── Versi cache: naikkan angka ini setiap kali deploy ulang ───
const CACHE_NAME = 'subang-pipe-monitoring-v8';

// Deteksi base path secara otomatis (misal '/debit/' di GitHub Pages atau '/' di localhost)
const BASE = self.location.pathname.replace(/sw\.js$/, '');

// Aset statis yang di-precache saat install
const PRECACHE_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'Subang_Jalur_ADB.json',
];

// CDN eksternal yang harus di-cache agar peta tampil offline
const CDN_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

// ─── Install: pre-cache aset statis ───────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const localCache = cache.addAll(PRECACHE_ASSETS).catch(() => {});
      const cdnCache = Promise.allSettled(
        CDN_ASSETS.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((res) => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        )
      );
      return Promise.all([localCache, cdnCache]);
    })
  );
  self.skipWaiting();
});

// ─── Activate: hapus cache lama ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch: strategi caching ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Aset JS/CSS Vite (hash → immutable) → Cache-First
  if (url.pathname.startsWith('/assets/') || url.pathname.match(/\.(js|css|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => caches.match(event.request));
      })
    );
    return;
  }

  // 2. Gambar & file statis → Cache-First
  if (url.pathname.match(/\.(png|svg|ico|jpg|jpeg|webp|json)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => caches.match(event.request));
      })
    );
    return;
  }

  // 3. CDN eksternal (Leaflet tiles, CSS) → Cache-First
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => caches.match(event.request));
      })
    );
    return;
  }

  // 4. HTML & navigasi → Network-First, fallback cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then((c) => c.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
