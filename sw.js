/* PRsonal — service worker (offline support).
 *
 * Strategy: NETWORK-FIRST for the app document, with a cached fallback.
 *  - Online  -> always fetches the latest index.html (so updates flow), and
 *              refreshes the cached copy.
 *  - Offline -> serves the last cached copy, so the app still opens.
 *
 * The app is a single self-contained file (Chart.js is inlined), so the only
 * thing worth caching is the page itself. Cross-origin requests (e.g. the
 * anonymous usage ping) are left untouched.
 *
 * This file rarely needs to change. Bump CACHE only if you change the SW logic.
 */
const CACHE = 'prsonal-shell-v24';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html']).catch(() => {}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // let cross-origin (the ping) pass

  const isDocument =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html');

  if (!isDocument) return; // everything else: default browser handling

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // Only cache a genuinely good same-origin response. Without this, a 404, a
      // 500, or a captive-portal login page (all of which resolve fetch normally)
      // would be written to the cache and become the app's offline copy.
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const c = await caches.open(CACHE);
        c.put('./', fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached =
        (await caches.match('./')) ||
        (await caches.match('./index.html')) ||
        (await caches.match(req));
      return cached || Response.error();
    }
  })());
});
