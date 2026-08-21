import { internalSymbolFor } from './symbols.js';
import { rawLiteTickSchema, type Tick, toTick } from './types.js';

/**
 * Live tick stream, lite mode.
 *
 * Fyers' data socket (`wss://socket.fyers.in/hsm/v1-5/prod`) speaks a binary
 * protocol that is neither published nor stable — the official SDK ships it
 * minified and obfuscated. Rather than reverse-engineer it, this wraps a
 * caller-supplied transport: in production the official `fyers-api-v3` data
 * socket, in tests a fake. What this module owns is the part that actually
 * needs to be correct and testable: reconnect with backoff, resubscribe of the
 * full symbol set, and a heartbeat watchdog that treats silence as death.
 */

export const FYERS_DATA_SOCKET_URL = 'wss://socket.fyers.in/hsm/v1-5/prod';

/** Fyers caps a single data-socket connection at 200 symbols. */
export const MAX_SUBSCRIPTION_SYMBOLS = 200;

/** The minimum a transport must provide. Matches the official SDK's surface. */
export interface TickTransport {
  connect(): void;
  close(): void;
  subscribe(symbols: string[]): void;
  unsubscribe(symbols: string[]): void;
  on(event: 'message', handler: (payload: unknown) => void): void;
  on(event: 'connect' | 'close', handler: () => void): void;
  on(event: 'error', handler: (error: unknown) => void): void;
}

export interface StreamOptions {
  /** Builds a fresh transport. Called again on every reconnect. */
  readonly createTransport: () => TickTransport;
  /** Treat the feed as dead after this long with no message. Default 30s. */
  readonly heartbeatTimeoutMs?: number;
  /** First reconnect delay; doubles up to `maxReconnectDelayMs`. Default 1s. */
  readonly reconnectDelayMs?: number;
  readonly maxReconnectDelayMs?: number;
  /** Give up after this many consecutive failures. Default Infinity. */
  readonly maxReconnectAttempts?: number;
  readonly onError?: (error: unknown) => void;
  readonly onStateChange?: (state: StreamState) => void;
  /** Injectable timers, for tests. */
  readonly setTimeoutImpl?: typeof setTimeout;
  readonly clearTimeoutImpl?: typeof clearTimeout;
  readonly random?: () => number;
}

export type StreamState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface TickStream {
  /** Adds symbols to the subscription and pushes them to the socket if live. */
  subscribe(symbols: string[]): void;
  unsubscribe(symbols: string[]): void;
  /** Currently subscribed Fyers symbols. */
  symbols(): string[];
  state(): StreamState;
  close(): void;
}

/**
 * Opens a lite-mode tick stream.
 *
 * Reconnect semantics: on close or heartbeat timeout the transport is discarded
 * and a new one built after a jittered backoff. The full symbol set is
 * resubscribed on every (re)connect — the socket keeps no state across
 * connections, so anything less silently loses feeds after the first drop.
 */
export function streamTicks(
  initialSymbols: string[],
  onTick: (tick: Tick) => void,
  options: StreamOptions,
): TickStream {
  const {
    createTransport,
    heartbeatTimeoutMs = 30_000,
    reconnectDelayMs = 1_000,
    maxReconnectDelayMs = 60_000,
    maxReconnectAttempts = Number.POSITIVE_INFINITY,
    onError,
    onStateChange,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    random = Math.random,
  } = options;

  const subscribed = new Set(initialSymbols);
  if (subscribed.size > MAX_SUBSCRIPTION_SYMBOLS) {
    throw new RangeError(
      `streamTicks: ${subscribed.size} symbols exceeds the ${MAX_SUBSCRIPTION_SYMBOLS}-symbol socket limit`,
    );
  }

  let transport: TickTransport | null = null;
  let state: StreamState = 'idle';
  let attempts = 0;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const setState = (next: StreamState): void => {
    if (state === next) return;
    state = next;
    onStateChange?.(next);
  };

  const clearHeartbeat = (): void => {
    if (heartbeatTimer !== null) {
      clearTimeoutImpl(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  /**
   * Restarts the watchdog. A live market socket is never silent for long; if it
   * goes quiet the TCP connection is usually half-open, which no 'close' event
   * will ever tell us about.
   */
  const armHeartbeat = (): void => {
    clearHeartbeat();
    if (stopped) return;
    heartbeatTimer = setTimeoutImpl(() => {
      onError?.(new Error(`No tick for ${heartbeatTimeoutMs}ms; assuming the socket is dead`));
      cycle();
    }, heartbeatTimeoutMs);
  };

  const teardown = (): void => {
    clearHeartbeat();
    if (transport !== null) {
      try {
        transport.close();
      } catch {
        // A transport that throws on close is already gone.
      }
      transport = null;
    }
  };

  /** Drops the current connection and schedules a fresh one. */
  const cycle = (): void => {
    if (stopped) return;
    teardown();

    attempts += 1;
    if (attempts > maxReconnectAttempts) {
      onError?.(new Error(`Giving up after ${attempts - 1} reconnect attempts`));
      setState('closed');
      stopped = true;
      return;
    }

    setState('reconnecting');
    const ceiling = Math.min(reconnectDelayMs * 2 ** (attempts - 1), maxReconnectDelayMs);
    const delay = Math.round(ceiling * (0.5 + random() * 0.5));
    reconnectTimer = setTimeoutImpl(connect, delay);
  };

  function connect(): void {
    if (stopped) return;
    reconnectTimer = null;
    setState(state === 'idle' ? 'connecting' : 'reconnecting');

    const next = createTransport();
    transport = next;

    next.on('connect', () => {
      attempts = 0;
      setState('live');
      // The socket remembers nothing across connections: always resubscribe.
      if (subscribed.size > 0) next.subscribe([...subscribed]);
      armHeartbeat();
    });

    next.on('message', (payload: unknown) => {
      armHeartbeat();
      const parsed = rawLiteTickSchema.safeParse(payload);
      if (!parsed.success) return; // acks and control frames share this channel
      const tick = toTick(parsed.data, safeInternalSymbol);
      if (tick !== null) onTick(tick);
    });

    next.on('error', (error: unknown) => {
      onError?.(error);
    });

    next.on('close', () => {
      if (stopped) return;
      cycle();
    });

    try {
      next.connect();
    } catch (error) {
      onError?.(error);
      cycle();
    }
  }

  connect();

  return {
    subscribe(symbols: string[]): void {
      const added: string[] = [];
      for (const symbol of symbols) {
        if (!subscribed.has(symbol)) {
          subscribed.add(symbol);
          added.push(symbol);
        }
      }
      if (subscribed.size > MAX_SUBSCRIPTION_SYMBOLS) {
        throw new RangeError(
          `subscribe: ${subscribed.size} symbols exceeds the ${MAX_SUBSCRIPTION_SYMBOLS}-symbol socket limit`,
        );
      }
      if (added.length > 0 && state === 'live' && transport !== null) {
        transport.subscribe(added);
      }
    },

    unsubscribe(symbols: string[]): void {
      const removed = symbols.filter((symbol) => subscribed.delete(symbol));
      if (removed.length > 0 && state === 'live' && transport !== null) {
        transport.unsubscribe(removed);
      }
    },

    symbols: () => [...subscribed],
    state: () => state,

    close(): void {
      stopped = true;
      if (reconnectTimer !== null) {
        clearTimeoutImpl(reconnectTimer);
        reconnectTimer = null;
      }
      teardown();
      setState('closed');
    },
  };
}

/** Falls back to the raw symbol when it does not parse, rather than throwing mid-stream. */
function safeInternalSymbol(fyersSymbol: string): string {
  try {
    return internalSymbolFor(fyersSymbol);
  } catch {
    return fyersSymbol;
  }
}
