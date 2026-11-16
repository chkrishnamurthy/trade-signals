import { jsonError, parseId } from '@/server/api-response';
import { clearStaleSessionCookie, unauthenticated } from '@/server/auth/http';
import { tooManyRequests } from '@/server/auth/request-limit';
import { getSessionUser } from '@/server/auth/require-user';
import { isUserAuthenticationError, MarketDataError } from '@/server/errors';
import { type LiveBatch, liveQuoteHub } from '@/server/live-quotes';
import { createSlotPool } from '@/server/stream-slots';
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
 *
 * One account may hold a handful of streams at once (one per open tab); past
 * that the answer is a 429 and the page keeps its polled prices.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Keep-alive comment cadence, so an idle proxy does not drop a quiet feed. */
const PING_MS = 15_000;

/** Open streams per user: enough for several tabs, not for a loop that opens them. */
const MAX_STREAMS_PER_USER = 6;
/** How long a refused client is told to wait before trying again. */
const STREAM_RETRY_AFTER_SEC = 30;

const KEY = Symbol.for('equitywise.web.live-stream-slots');
/** On `globalThis` so a dev hot reload does not forget the streams still open. */
function streamSlots(): ReturnType<typeof createSlotPool> {
  const store = globalThis as unknown as { [KEY]?: ReturnType<typeof createSlotPool> };
  store[KEY] ??= createSlotPool(MAX_STREAMS_PER_USER);
  return store[KEY];
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const id = parseId((await params).id);
  if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

  const user = await getSessionUser();
  if (user === null) return unauthenticated();

  let refs: Awaited<ReturnType<typeof getWatchlistLiveRefs>>;
  try {
    refs = await getWatchlistLiveRefs(id);
  } catch (error) {
    const failure = error instanceof MarketDataError ? error : toMarketError(error);
    const response = jsonError(failure.message, failure.status, { code: failure.code });
    return isUserAuthenticationError(failure) ? clearStaleSessionCookie(response) : response;
  }
  if (refs === null)
    return jsonError('That watchlist no longer exists.', 404, { code: 'NOT_FOUND' });

  // Taken only now, so a refused or missing list never holds a slot.
  const releaseSlot = streamSlots().acquire(`user:${user.id}`);
  if (releaseSlot === null) return tooManyRequests(STREAM_RETRY_AFTER_SEC);

  const encoder = new TextEncoder();
  let release: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  /** The one teardown: every way a stream ends comes through here, once or many times. */
  const cleanup = (): void => {
    if (ping !== null) {
      clearInterval(ping);
      ping = null;
    }
    release?.();
    release = null;
    releaseSlot();
  };

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

      try {
        release = liveQuoteHub().subscribe(refs, send).release;
      } catch (error) {
        // A stream that never started must not keep its slot.
        cleanup();
        throw error;
      }
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, PING_MS);

      const onAbort = (): void => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      // A request that was already aborted never fires the event.
      if (request.signal.aborted) onAbort();
      else request.signal.addEventListener('abort', onAbort, { once: true });
    },
    cancel() {
      cleanup();
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
