import { getIndexStripRefs } from '@/server/index-strip';
import { type LiveBatch, liveQuoteHub } from '@/server/live-quotes';

/**
 * GET /api/market/indices/live — server-sent events for the indices strip.
 *
 * Same frame shape as `/api/watchlists/:id/live` (`{ state, quotes }`, one
 * frame per second at most, only the symbols that moved), so the client
 * consumes both with one code path. The hub de-duplicates by symbol, so a
 * user with the strip and a watchlist open costs the upstream the union of
 * both sets, once.
 *
 * Auth is the middleware's; there is no per-user data here. The subscription
 * is released the moment the browser closes the connection.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Keep-alive comment cadence, so an idle proxy does not drop a quiet feed. */
const PING_MS = 15_000;

export async function GET(request: Request): Promise<Response> {
  const refs = await getIndexStripRefs();

  const encoder = new TextEncoder();
  let release: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = (): void => {
        if (ping !== null) {
          clearInterval(ping);
          ping = null;
        }
        release?.();
        release = null;
      };
      const send = (batch: LiveBatch): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(batch)}\n\n`));
        } catch {
          // The consumer went away between the check and the write.
          cleanup();
        }
      };

      release = liveQuoteHub().subscribe(refs, send).release;
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, PING_MS);

      request.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      if (ping !== null) clearInterval(ping);
      release?.();
      release = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // Nginx must not buffer an event stream, or frames arrive in bursts.
      'X-Accel-Buffering': 'no',
    },
  });
}
