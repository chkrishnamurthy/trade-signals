import { clearStaleSessionCookie } from '@/server/auth/http';
import { MarketDataError } from '@/server/errors';
import { type LiveBatch, liveQuoteHub } from '@/server/live-quotes';
import { jsonError, parseId } from '@/server/watchlist-routes';
import { getWatchlistLiveRefs, toMarketError } from '@/server/watchlists';

/**
 * GET /api/watchlists/:id/live — server-sent events of price changes.
 *
 * One frame per second at most, carrying only the symbols whose price moved
 * (see `live-quotes.ts`). Each frame is `{ state, quotes }`; a frame with no
 * quotes is a state change (the feed went from socket to poll, or the market
 * closed), and the client keeps its last prices.
 *
 * Auth is the gate every watchlist route has: an unowned or missing list is a
 * 404 before a single byte streams. The connection is torn down — and the
 * hub's subscription released — the moment the browser closes it.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Keep-alive comment cadence, so an idle proxy does not drop a quiet feed. */
const PING_MS = 15_000;

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const id = parseId((await params).id);
  if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

  let refs: Awaited<ReturnType<typeof getWatchlistLiveRefs>>;
  try {
    refs = await getWatchlistLiveRefs(id);
  } catch (error) {
    const failure = error instanceof MarketDataError ? error : toMarketError(error);
    const response = jsonError(failure.message, failure.status, { code: failure.code });
    return failure.status === 401 ? clearStaleSessionCookie(response) : response;
  }
  if (refs === null)
    return jsonError('That watchlist no longer exists.', 404, { code: 'NOT_FOUND' });

  const encoder = new TextEncoder();
  let release: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (batch: LiveBatch): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(batch)}\n\n`));
        } catch {
          // The consumer went away between the check and the write.
          cleanup();
        }
      };
      const cleanup = (): void => {
        if (ping !== null) {
          clearInterval(ping);
          ping = null;
        }
        release?.();
        release = null;
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
