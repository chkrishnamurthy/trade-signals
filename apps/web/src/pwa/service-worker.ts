/**
 * The service worker, as source text served by `app/sw.js/route.ts`
 * (docs/planning/pwa-plan.md §3.5).
 *
 * It does one thing: when a page navigation fails because there is no network,
 * it answers with the precached `/offline.html` instead of the browser's error
 * page. It never stores a page, an API response, a price or anything per-user,
 * and it never touches `/api/*`, event streams, non-GET requests or other
 * origins — those go to the network exactly as if there were no worker.
 *
 * The routing decision is a plain function so it can be unit-tested; its
 * source is embedded into the worker with `Function.prototype.toString()`, so
 * it must stay self-contained (no imports, no outer references).
 */

export interface SwRequestFacts {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
  /** The worker's own origin (`self.location.origin`). */
  readonly origin: string;
}

/** `offline-fallback`: network, with the offline page if it fails. `bypass`: not intercepted. */
export type SwDecision = 'offline-fallback' | 'bypass';

export function classifyRequest(request: SwRequestFacts): SwDecision {
  if (request.method !== 'GET') return 'bypass';
  if (request.mode !== 'navigate') return 'bypass';
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return 'bypass';
  }
  if (url.origin !== request.origin) return 'bypass';
  // API navigations (the Google sign-in hop, file exports) are never answered
  // by the worker, even offline.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return 'bypass';
  return 'offline-fallback';
}

export const OFFLINE_URL = '/offline.html';
/** Every cache this worker owns starts with this; anything else is left alone. */
export const CACHE_PREFIX = 'ew-';

export function buildServiceWorkerSource(options: { version: string; kill: boolean }): string {
  const version = JSON.stringify(options.version);
  if (options.kill) {
    // Kill switch (PWA_SW_KILL=1): replaces any installed worker, deletes its
    // caches, unregisters itself and reloads open windows onto the network.
    return `/* EquityWise service worker — kill switch, ${version} */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(${JSON.stringify(CACHE_PREFIX)})).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const client of windows) client.navigate(client.url);
  })());
});
`;
  }

  return `/* EquityWise service worker ${version} — see docs/planning/pwa-plan.md */
const VERSION = ${version};
const CACHE = ${JSON.stringify(CACHE_PREFIX)} + 'offline-' + VERSION;
const OFFLINE_URL = ${JSON.stringify(OFFLINE_URL)};
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];
const classifyRequest = ${classifyRequest.toString()};

self.addEventListener('install', (event) => {
  // No skipWaiting() here: the page asks the user before switching versions.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(${JSON.stringify(CACHE_PREFIX)}) && k !== CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const decision = classifyRequest({ url: request.url, method: request.method, mode: request.mode, origin: self.location.origin });
  if (decision !== 'offline-fallback') return;
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      if (preloaded) return preloaded;
      return await fetch(request);
    } catch (error) {
      const offline = await caches.match(OFFLINE_URL, { cacheName: CACHE });
      return offline || Response.error();
    }
  })());
});
`;
}
