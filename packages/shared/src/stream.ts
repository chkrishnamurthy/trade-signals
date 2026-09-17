/**
 * A reconnecting subscription over a caller-supplied transport.
 *
 * Every live market socket needs the same three things done correctly, and
 * none of them are provider-specific: reconnect with jittered backoff,
 * resubscribe the full symbol set on every (re)connect (no socket keeps state
 * across connections), and a heartbeat watchdog that treats silence as death
 * — a half-open TCP connection never sends a 'close'.
 *
 * What differs per provider is the wire format, which the transport speaks,
 * and how a raw message becomes a tick, which the caller's `decode` does.
 * Provider packages wrap this with their own symbol type and decoder.
 */

/** The minimum a transport must provide. */
export interface TickTransport<TSymbol = string> {
  connect(): void;
  close(): void;
  subscribe(symbols: TSymbol[]): void;
  unsubscribe(symbols: TSymbol[]): void;
  on(event: 'message', handler: (payload: unknown) => void): void;
  on(event: 'connect' | 'close', handler: () => void): void;
  on(event: 'error', handler: (error: unknown) => void): void;
}

export type StreamState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface ReconnectingStreamOptions<TSymbol, TTick> {
  /** Builds a fresh transport. Called again on every reconnect. */
  readonly createTransport: () => TickTransport<TSymbol>;
  /**
   * Turns a raw transport message into a tick, or null for anything else —
   * acks, control frames, packet types the caller does not want. Any message
   * (decoded or not) feeds the heartbeat: the socket is alive.
   */
  readonly decode: (payload: unknown) => TTick | null;
  /** Provider's per-connection symbol cap; exceeding it is a caller error. */
  readonly maxSymbols?: number;
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

export interface ReconnectingStream<TSymbol> {
  /** Adds symbols to the subscription and pushes them to the socket if live. */
  subscribe(symbols: TSymbol[]): void;
  unsubscribe(symbols: TSymbol[]): void;
  /** Currently subscribed symbols, in the transport's vocabulary. */
  symbols(): TSymbol[];
  state(): StreamState;
  close(): void;
}

export function createReconnectingStream<TSymbol extends string, TTick>(
  initialSymbols: TSymbol[],
  onTick: (tick: TTick) => void,
  options: ReconnectingStreamOptions<TSymbol, TTick>,
): ReconnectingStream<TSymbol> {
  const {
    createTransport,
    decode,
    maxSymbols = Number.POSITIVE_INFINITY,
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
  if (subscribed.size > maxSymbols) {
    throw new RangeError(
      `streamTicks: ${subscribed.size} symbols exceeds the ${maxSymbols}-symbol socket limit`,
    );
  }

  let transport: TickTransport<TSymbol> | null = null;
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
      const tick = decode(payload);
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
    subscribe(symbols: TSymbol[]): void {
      const added: TSymbol[] = [];
      for (const symbol of symbols) {
        if (!subscribed.has(symbol)) {
          subscribed.add(symbol);
          added.push(symbol);
        }
      }
      if (subscribed.size > maxSymbols) {
        throw new RangeError(
          `subscribe: ${subscribed.size} symbols exceeds the ${maxSymbols}-symbol socket limit`,
        );
      }
      if (added.length > 0 && state === 'live' && transport !== null) {
        transport.subscribe(added);
      }
    },

    unsubscribe(symbols: TSymbol[]): void {
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
