/* sw.js — offline support for EO Multiversion Bible.
 *
 * Two caches with different rules:
 *   shell      — app code and fonts. Network-first so updates land promptly,
 *                cache fallback so the app always opens.
 *   scripture  — Bible book files. Cache-first and never revalidated: the text
 *                is immutable, so once a book is saved it is simply kept.
 */
const VERSION = 'v1';
const SHELL = `eo-shell-${VERSION}`;
const SCRIPTURE = `eo-scripture-${VERSION}`;
const KEEP = new Set([SHELL, SCRIPTURE]);

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/bible-engine.js',
  'js/storage.js',
  'js/settings.js',
  'js/study.js',
  'js/ui.js',
  'js/home.js',
  'js/library.js',
  'js/reader.js',
  'js/search.js',
  'js/compare.js',
  'js/study-view.js',
  'js/settings-view.js',
  'assets/fonts/literata.woff2',
  'assets/fonts/literata-italic.woff2',
  'assets/fonts/archivo.woff2',
  'assets/icon.svg',
  'data/canon.json',
  'legal/privacy.html',
  'legal/terms.html',
  'legal/licences.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Individually, so one missing optional file cannot fail the whole install.
    await Promise.all(PRECACHE.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (KEEP.has(n) ? null : caches.delete(n))));
    await self.clients.claim();
  })());
});

const isScripture = (url) => url.pathname.includes('/data/translations/');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Scripture: cache-first, permanent.
  if (isScripture(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(SCRIPTURE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch {
        return new Response(
          JSON.stringify({ error: 'offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })());
    return;
  }

  // Navigations: network-first, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        const cache = await caches.open(SHELL);
        cache.put('index.html', res.clone());
        return res;
      } catch {
        const cache = await caches.open(SHELL);
        return (await cache.match('index.html')) || (await cache.match('./')) ||
          new Response('EO Multiversion Bible is offline and has not been installed yet.', {
            status: 503, headers: { 'Content-Type': 'text/plain' },
          });
      }
    })());
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(request);
    const network = fetch(request)
      .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
      .catch(() => null);
    return hit || (await network) || new Response('', { status: 504 });
  })());
});
