import { buildServiceWorkerSource } from '@/pwa/service-worker';

/**
 * `/sw.js` — the service worker (docs/planning/pwa-plan.md §3.5).
 *
 * Served by a route rather than from `public/` so each build gets a
 * byte-different worker (the build stamp is inlined by next.config.ts), which
 * is what makes browsers pick up a new version after a deploy. Outside the
 * middleware matcher (`.js`), so it is public, as a worker script must be.
 *
 * Kill switch: set `PWA_SW_KILL=1` in the web process's environment and
 * restart; every installed worker unregisters itself on its next update check.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const source = buildServiceWorkerSource({
    version: process.env.PWA_BUILD_ID ?? 'dev',
    kill: process.env.PWA_SW_KILL === '1',
  });
  return new Response(source, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // A worker must never be served from an HTTP cache, or updates stall.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
