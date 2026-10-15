/* Application files only; financial records stay in SQLite, outside this cache. */
const PREFIX = 'owllowance-shell-';
let activeCache;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('/offline-manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Offline manifest unavailable');
    const manifest = await response.json();
    activeCache = `${PREFIX}${manifest.version}`;
    const cache = await caches.open(activeCache);
    await cache.addAll(manifest.files.map(file => `/${file}`));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // A worker restart can clear globals. Existing caches remain usable.
    const keys = (await caches.keys()).filter(key => key.startsWith(PREFIX));
    if (activeCache) await Promise.all(keys.filter(key => key !== activeCache).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      ['/sw.js', '/offline-manifest.json'].includes(url.pathname)) return;
  event.respondWith((async () => {
    if (event.request.mode === 'navigate') {
      try { return await fetch(event.request); }
      catch {
        const page = await caches.match('/index.html');
        return page || Response.error();
      }
    }
    const cached = await caches.match(event.request);
    return cached || fetch(event.request);
  })());
});
