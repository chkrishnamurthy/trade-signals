import {
  createReconnectingStream,
  type StreamState as SharedStreamState,
  type TickTransport as SharedTickTransport,
} from '@equitywise/shared';
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
export type TickTransport = SharedTickTransport<string>;

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

export type StreamState = SharedStreamState;

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
 * The reconnect / resubscribe / heartbeat machinery is the shared
 * `createReconnectingStream`; what is Fyers-specific here is the 200-symbol
 * cap and turning a lite-mode payload into a tick. Acks and control frames
 * share the message channel and decode to null.
 */
export function streamTicks(
  initialSymbols: string[],
  onTick: (tick: Tick) => void,
  options: StreamOptions,
): TickStream {
  return createReconnectingStream<string, Tick>(initialSymbols, onTick, {
    ...options,
    maxSymbols: MAX_SUBSCRIPTION_SYMBOLS,
    decode: (payload) => {
      const parsed = rawLiteTickSchema.safeParse(payload);
      if (!parsed.success) return null;
      return toTick(parsed.data, safeInternalSymbol);
    },
  });
}

/** Falls back to the raw symbol when it does not parse, rather than throwing mid-stream. */
function safeInternalSymbol(fyersSymbol: string): string {
  try {
    return internalSymbolFor(fyersSymbol);
  } catch {
    return fyersSymbol;
  }
}
