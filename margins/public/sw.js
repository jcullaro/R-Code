// Minimal service worker: app shell cached for fast loads; saved content is
// cached as you read it so already-opened items work offline. API calls and
// the share-target POST always go to the network.

const SHELL_CACHE = 'margins-shell-v1';
const CONTENT_CACHE = 'margins-content-v1';
const SHELL = [
  '/', '/index.html', '/reader.html',
  '/css/app.css',
  '/js/api.js', '/js/library.js', '/js/reader.js',
  '/js/highlighter.js', '/js/tts.js', '/js/pdf-reader.js',
  '/icons/icon.svg', '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![SHELL_CACHE, CONTENT_CACHE].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/share' || url.pathname === '/clip') return;

  const isContent = url.pathname.startsWith('/content/') || url.pathname.startsWith('/vendor/');
  e.respondWith(
    (async () => {
      const cache = await caches.open(isContent ? CONTENT_CACHE : SHELL_CACHE);
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch (err) {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
