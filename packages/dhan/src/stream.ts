import {
  createReconnectingStream,
  type ReconnectingStream,
  type ReconnectingStreamOptions,
  rupeesToPaise,
  type StreamState,
  type TickTransport,
} from '@equitywise/shared';
import type { DhanSession } from './http.js';
import { type ExchangeSegment, type SecurityRef, securityKey } from './types.js';

/**
 * Live market feed — Dhan's binary websocket (v2).
 *
 * Unlike Fyers, the protocol is DOCUMENTED (dhanhq.co/docs/v2/live-market-feed,
 * verified 2026-09-17), so there is no SDK to wrap: this file speaks it
 * directly over Node's built-in `WebSocket`. The wire format is little-endian
 * binary with an 8-byte header; subscriptions are JSON, at most 100
 * instruments per message and 5,000 per connection, five connections per
 * user. The server pings every 10 s and closes after 40 s without a pong —
 * the built-in client answers pings on its own.
 *
 * The reconnect / resubscribe / heartbeat machinery is the shared
 * `createReconnectingStream`; what is Dhan-specific here is the codec and the
 * transport.
 */

export const DHAN_FEED_URL = 'wss://api-feed.dhan.co';

/** Documented per-connection cap; 25× the Fyers socket's. */
export const MAX_FEED_INSTRUMENTS = 5_000;
/** Documented per-message cap. */
export const MAX_INSTRUMENTS_PER_MESSAGE = 100;
/** Documented per-user cap; the sixth connection kills the first (805). */
export const MAX_FEED_CONNECTIONS = 5;

/** Ticker: price + trade time. Quote: adds day OHLC, volume and previous close. */
export type FeedMode = 'ticker' | 'quote';

/** Feed request codes (Annexure). */
export const REQUEST_CODES = {
  ticker: { subscribe: 15, unsubscribe: 16 },
  quote: { subscribe: 17, unsubscribe: 18 },
  full: { subscribe: 21, unsubscribe: 22 },
  disconnect: 12,
} as const;

/** Feed response codes — the first header byte. */
export const RESPONSE_CODES = {
  ticker: 2,
  quote: 4,
  openInterest: 5,
  previousClose: 6,
  full: 8,
  disconnect: 50,
} as const;

/** Exchange segment enum in the header's fourth byte (Annexure). */
const SEGMENT_BY_CODE: Readonly<Record<number, ExchangeSegment>> = {
  0: 'IDX_I',
  1: 'NSE_EQ',
  4: 'BSE_EQ',
};

/** Disconnection reason codes (Annexure, "Data API Error Codes"). */
export const DISCONNECT_REASONS: Readonly<Record<number, string>> = {
  805: 'Too many requests or connections',
  806: 'Data APIs not subscribed',
  807: 'Access token expired',
  808: 'Authentication failed: client id or access token invalid',
  809: 'Access token invalid',
  810: 'Client id invalid',
};

/** Reasons that no reconnect can fix: the credential itself is the problem. */
export function isCredentialDisconnect(code: number): boolean {
  return code >= 806 && code <= 810;
}

export function feedUrl(session: DhanSession, base = DHAN_FEED_URL): string {
  const url = new URL(base);
  url.searchParams.set('version', '2');
  url.searchParams.set('token', session.accessToken);
  url.searchParams.set('clientId', session.clientId);
  url.searchParams.set('authType', '2');
  return url.toString();
}

/** The subscription messages for a set of instruments, chunked to the cap. */
export function encodeFeedRequests(
  code: number,
  refs: readonly SecurityRef[],
  chunkSize = MAX_INSTRUMENTS_PER_MESSAGE,
): string[] {
  const messages: string[] = [];
  for (let i = 0; i < refs.length; i += chunkSize) {
    const chunk = refs.slice(i, i + chunkSize);
    messages.push(
      JSON.stringify({
        RequestCode: code,
        InstrumentCount: chunk.length,
        InstrumentList: chunk.map((ref) => ({
          ExchangeSegment: ref.segment,
          SecurityId: ref.securityId,
        })),
      }),
    );
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Binary packets
// ---------------------------------------------------------------------------

export interface FeedHeader {
  readonly code: number;
  readonly length: number;
  readonly ref: SecurityRef | null;
  /** The raw segment byte, kept for packets on segments this app ignores. */
  readonly segmentCode: number;
}

export interface TickerPacket {
  readonly kind: 'ticker';
  readonly ref: SecurityRef;
  /** Paise. */
  readonly ltp: number;
  readonly lastTradedAt: Date | null;
}

export interface QuotePacket {
  readonly kind: 'quote';
  readonly ref: SecurityRef;
  readonly ltp: number;
  readonly lastTradedQuantity: number;
  readonly lastTradedAt: Date | null;
  readonly averagePrice: number;
  readonly volume: number;
  readonly totalSellQuantity: number;
  readonly totalBuyQuantity: number;
  readonly open: number;
  /** Dhan's "day close" — the previous close until the session ends. */
  readonly close: number;
  readonly high: number;
  readonly low: number;
}

export interface PreviousClosePacket {
  readonly kind: 'previousClose';
  readonly ref: SecurityRef;
  readonly previousClose: number;
  readonly previousOpenInterest: number;
}

export interface DisconnectPacket {
  readonly kind: 'disconnect';
  readonly code: number;
  readonly reason: string;
}

export interface OtherPacket {
  readonly kind: 'other';
  readonly header: FeedHeader;
}

export type FeedPacket =
  | TickerPacket
  | QuotePacket
  | PreviousClosePacket
  | DisconnectPacket
  | OtherPacket;

const HEADER_BYTES = 8;

/**
 * Last-trade "epoch" → instant.
 *
 * Verified live 2026-09-17: the value is IST WALL-CLOCK seconds, not UTC —
 * RELIANCE's last trade decoded to 15:58:24 (the post-close session) only
 * once 5 h 30 m were subtracted, and an index's stamp equalled the current
 * IST time. The same convention as the REST quote's `last_trade_time` string.
 * Zero means "no trade yet" and is null, like the REST 1980 sentinel.
 */
const IST_OFFSET_SECONDS = 5.5 * 3_600;

function tradeTime(istWallClockSeconds: number): Date | null {
  return istWallClockSeconds <= 0
    ? null
    : new Date((istWallClockSeconds - IST_OFFSET_SECONDS) * 1_000);
}

/** float32 rupees → integer paise. float32 carries ~7 significant digits: fine to ₹99,999.99. */
function paise(view: DataView, offset: number): number {
  return rupeesToPaise(view.getFloat32(offset, true));
}

export function decodeFeedHeader(view: DataView): FeedHeader {
  const code = view.getUint8(0);
  const length = view.getInt16(1, true);
  const segmentCode = view.getUint8(3);
  const securityId = String(view.getInt32(4, true));
  const segment = SEGMENT_BY_CODE[segmentCode];
  return {
    code,
    length,
    segmentCode,
    ref: segment === undefined ? null : { segment, securityId },
  };
}

/**
 * One binary frame → one packet. Never throws on an unknown code or a short
 * frame: the stream must survive a packet type this app has not seen.
 */
export function decodeFeedPacket(data: ArrayBuffer | ArrayBufferView): FeedPacket | null {
  const view = ArrayBuffer.isView(data)
    ? new DataView(data.buffer, data.byteOffset, data.byteLength)
    : new DataView(data);
  if (view.byteLength < HEADER_BYTES) return null;
  const header = decodeFeedHeader(view);

  if (header.code === RESPONSE_CODES.disconnect) {
    const code = view.byteLength >= HEADER_BYTES + 2 ? view.getInt16(HEADER_BYTES, true) : 0;
    return {
      kind: 'disconnect',
      code,
      reason: DISCONNECT_REASONS[code] ?? `Feed closed (${code})`,
    };
  }
  if (header.ref === null) return { kind: 'other', header };

  switch (header.code) {
    case RESPONSE_CODES.ticker:
      if (view.byteLength < 16) return null;
      return {
        kind: 'ticker',
        ref: header.ref,
        ltp: paise(view, 8),
        lastTradedAt: tradeTime(view.getInt32(12, true)),
      };
    case RESPONSE_CODES.previousClose:
      if (view.byteLength < 16) return null;
      return {
        kind: 'previousClose',
        ref: header.ref,
        previousClose: paise(view, 8),
        previousOpenInterest: view.getInt32(12, true),
      };
    case RESPONSE_CODES.quote:
      if (view.byteLength < 50) return null;
      return {
        kind: 'quote',
        ref: header.ref,
        ltp: paise(view, 8),
        lastTradedQuantity: view.getInt16(12, true),
        lastTradedAt: tradeTime(view.getInt32(14, true)),
        averagePrice: paise(view, 18),
        volume: view.getInt32(22, true),
        totalSellQuantity: view.getInt32(26, true),
        totalBuyQuantity: view.getInt32(30, true),
        open: paise(view, 34),
        close: paise(view, 38),
        high: paise(view, 42),
        low: paise(view, 46),
      };
    default:
      return { kind: 'other', header };
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** The subset of the WHATWG `WebSocket` this transport uses; Node ≥ 22 has it built in. */
export interface FeedSocket {
  binaryType: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(
    type: 'close',
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface FeedTransportOptions {
  readonly mode?: FeedMode;
  /** Injectable socket constructor, for tests. Default: the global `WebSocket`. */
  readonly createSocket?: (url: string) => FeedSocket;
  readonly baseUrl?: string;
}

/** Symbols on this transport are `securityKey` strings: `NSE_EQ:1333`. */
export function parseSecurityKey(key: string): SecurityRef | null {
  const [segment, securityId] = key.split(':');
  if (
    (segment !== 'NSE_EQ' && segment !== 'BSE_EQ' && segment !== 'IDX_I') ||
    securityId === undefined
  ) {
    return null;
  }
  return { segment, securityId };
}

type Handlers = {
  message: ((payload: unknown) => void)[];
  connect: (() => void)[];
  close: (() => void)[];
  error: ((error: unknown) => void)[];
};

/**
 * One websocket connection as a `TickTransport`.
 *
 * Emits DECODED packets on 'message' (the reconnecting stream's `decode` then
 * picks the ones it wants). A disconnect packet naming a credential problem
 * is surfaced as an error before the socket closes, so the caller can tell a
 * dead token from a network blip.
 */
export class DhanFeedTransport implements TickTransport<string> {
  private socket: FeedSocket | null = null;
  /** Set by `close()`: the error the server raises on our own disconnect is not news. */
  private closing = false;
  private readonly handlers: Handlers = { message: [], connect: [], close: [], error: [] };
  private readonly mode: FeedMode;
  private readonly createSocket: (url: string) => FeedSocket;
  private readonly url: string;

  constructor(session: DhanSession, options: FeedTransportOptions = {}) {
    this.mode = options.mode ?? 'ticker';
    this.createSocket =
      options.createSocket ?? ((url): FeedSocket => new WebSocket(url) as unknown as FeedSocket);
    this.url = feedUrl(session, options.baseUrl);
  }

  connect(): void {
    const socket = this.createSocket(this.url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.addEventListener('open', () => {
      for (const handler of this.handlers.connect) handler();
    });
    socket.addEventListener('message', (event) => {
      const packet = decodeFrame(event.data);
      if (packet === null) return;
      if (packet.kind === 'disconnect') {
        // Said before the close so the caller knows WHY; 805–810 are the
        // account, not the network.
        this.emitError(new DhanFeedError(packet.code, packet.reason));
      }
      for (const handler of this.handlers.message) handler(packet);
    });
    socket.addEventListener('error', (event) => {
      if (this.closing) return;
      this.emitError(event instanceof Error ? event : new Error('Dhan feed socket error'));
    });
    socket.addEventListener('close', () => {
      this.socket = null;
      for (const handler of this.handlers.close) handler();
    });
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.closing = true;
    if (socket === null) return;
    try {
      socket.send(JSON.stringify({ RequestCode: REQUEST_CODES.disconnect }));
    } catch {
      // Already gone; the close below is what matters.
    }
    socket.close();
  }

  subscribe(keys: string[]): void {
    this.send(REQUEST_CODES[this.mode].subscribe, keys);
  }

  unsubscribe(keys: string[]): void {
    this.send(REQUEST_CODES[this.mode].unsubscribe, keys);
  }

  on(event: 'message', handler: (payload: unknown) => void): void;
  on(event: 'connect' | 'close', handler: () => void): void;
  on(event: 'error', handler: (error: unknown) => void): void;
  on(event: keyof Handlers, handler: (...args: never[]) => void): void {
    (this.handlers[event] as ((...args: never[]) => void)[]).push(handler);
  }

  private send(code: number, keys: string[]): void {
    if (this.socket === null) return;
    const refs = keys.map(parseSecurityKey).filter((ref): ref is SecurityRef => ref !== null);
    for (const message of encodeFeedRequests(code, refs)) this.socket.send(message);
  }

  private emitError(error: unknown): void {
    for (const handler of this.handlers.error) handler(error);
  }
}

/** A frame as the socket hands it over: binary in production, anything in tests. */
function decodeFrame(data: unknown): FeedPacket | null {
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return decodeFeedPacket(data);
  return null;
}

export class DhanFeedError extends Error {
  readonly code: number;
  constructor(code: number, reason: string) {
    super(`Dhan feed disconnected: ${reason} (${code})`);
    this.name = 'DhanFeedError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Stream
// ---------------------------------------------------------------------------

export interface DhanTick {
  readonly ref: SecurityRef;
  readonly ltp: number;
  readonly lastTradedAt: Date | null;
  /** Present in quote mode only. */
  readonly volume: number | null;
}

export type DhanStreamOptions = Omit<
  ReconnectingStreamOptions<string, DhanTick>,
  'decode' | 'maxSymbols'
>;

export type { StreamState };
export type DhanTickStream = ReconnectingStream<string>;

/**
 * Opens a tick stream over `securityKey` symbols.
 *
 * Ticker and quote packets become ticks; previous-close and OI packets are
 * dropped (the REST quote carries the previous close where it is needed).
 */
export function streamTicks(
  initialKeys: string[],
  onTick: (tick: DhanTick) => void,
  options: DhanStreamOptions,
): DhanTickStream {
  return createReconnectingStream<string, DhanTick>(initialKeys, onTick, {
    ...options,
    maxSymbols: MAX_FEED_INSTRUMENTS,
    decode: (payload) => {
      const packet = payload as FeedPacket | null;
      if (packet === null || typeof packet !== 'object') return null;
      if (packet.kind === 'ticker')
        return {
          ref: packet.ref,
          ltp: packet.ltp,
          lastTradedAt: packet.lastTradedAt,
          volume: null,
        };
      if (packet.kind === 'quote')
        return {
          ref: packet.ref,
          ltp: packet.ltp,
          lastTradedAt: packet.lastTradedAt,
          volume: packet.volume,
        };
      return null;
    },
  });
}

/** Re-exported so callers can build keys without importing `types`. */
export { securityKey };
