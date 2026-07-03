/* Keji Camper service worker — app-shell caching (v0.3).
 * Same-origin assets are served stale-while-revalidate so the app OPENS in
 * the parking lot with no signal. Map tiles and weather APIs are deliberately
 * not cached (licensing + freshness); the app handles their absence.
 *
 * Install precaches the shell AND every asset the shell HTML references, fetched
 * with cache:'no-cache' so a just-deployed HTML can't be shadowed by a stale
 * HTTP-cache copy (GitHub Pages serves max-age=600). Precache is
 * all-or-nothing: if anything fails (offline, captive portal, mid-deploy 404)
 * the install aborts and the previous worker keeps serving. That makes CACHE
 * bumps safe — the new cache is fully populated before activate purges old
 * keji-camper-* caches — but a bump is only needed to evict stale UNhashed
 * entries (fonts, icons, manifest); hashed asset URLs never collide.
 */
const CACHE_PREFIX = 'keji-camper-';
const CACHE = `${CACHE_PREFIX}v4`;

/* Error pages and captive-portal redirects must never enter the cache, or
 * they become the offline app. */
function cacheable(res) {
  return res.ok && !res.redirected;
}

async function fetchFresh(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!cacheable(res)) {
    throw new Error(`precache ${url}: ${res.status}${res.redirected ? ' (redirected)' : ''}`);
  }
  return res;
}

async function precacheShell() {
  const shell = await fetchFresh('./');
  const headers = new Headers(shell.headers);
  headers.delete('content-encoding'); // body below is decoded text, not gzip
  headers.delete('content-length'); // encoded-transfer length no longer matches
  const html = await shell.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]))];
  const fetched = await Promise.all(assets.map(async (url) => [url, await fetchFresh(url)]));
  /* Every fetch succeeded — only now touch the cache, shell last, so an
   * install running against the LIVE cache (sw.js edited without a CACHE
   * bump) can never leave a shell that points at missing assets. */
  const cache = await caches.open(CACHE);
  await Promise.all(fetched.map(([url, res]) => cache.put(url, res)));
  /* Re-wrap: a Response stored after .text() needs a new body, and the copy
   * drops the redirect flag so it is always servable for navigations. */
  await cache.put('./', new Response(html, { headers }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

function offlineResponse() {
  return new Response('offline', { status: 503, statusText: 'Service Unavailable' });
}

async function cachedShell() {
  const cache = await caches.open(CACHE);
  return (await cache.match('./')) || offlineResponse();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiles/APIs: network only

  if (req.mode === 'navigate') {
    /* Network-first for the shell; no-cache skips a stale HTTP-cache copy
     * whose hashed asset URLs may already be purged. The request copy keeps
     * redirect-mode 'manual', so a portal redirect comes back as
     * opaqueredirect: not cacheable(), returned as-is for the browser to
     * follow — same as without a service worker. */
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put('./', copy)));
          }
          return res;
        })
        .catch(cachedShell),
    );
    return;
  }

  /* Stale-while-revalidate for hashed assets, fonts, data. Reads are scoped
   * to the current cache (not global caches.match) so entries resurrected in
   * an old cache by a dying worker's in-flight write can never serve. */
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const refresh = fetch(req).then((res) => {
        if (cacheable(res)) {
          const copy = res.clone();
          event.waitUntil(cache.put(req, copy));
        }
        return res;
      });
      const cached = await cache.match(req);
      if (cached) {
        /* Keep the revalidation alive after respondWith settles. */
        event.waitUntil(refresh.catch(() => {}));
        return cached;
      }
      return refresh.catch(() => offlineResponse());
    }),
  );
});
