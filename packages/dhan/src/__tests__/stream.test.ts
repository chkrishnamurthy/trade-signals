import { describe, expect, it, vi } from 'vitest';
import {
  DhanFeedError,
  DhanFeedTransport,
  decodeFeedPacket,
  encodeFeedRequests,
  type FeedPacket,
  type FeedSocket,
  feedUrl,
  isCredentialDisconnect,
  MAX_INSTRUMENTS_PER_MESSAGE,
  parseSecurityKey,
  REQUEST_CODES,
  streamTicks,
} from '../stream.js';

// ---------------------------------------------------------------------------
// Frame builders — the documented layouts, little-endian, hand-assembled.
// ---------------------------------------------------------------------------

function header(code: number, segment: number, securityId: number, payload: number): DataView {
  const view = new DataView(new ArrayBuffer(8 + payload));
  view.setUint8(0, code);
  view.setInt16(1, payload, true);
  view.setUint8(3, segment);
  view.setInt32(4, securityId, true);
  return view;
}

/** IST wall-clock seconds, as the feed sends them. */
const istSeconds = (iso: string): number => Date.parse(iso) / 1_000 + 5.5 * 3_600;

function tickerFrame(segment: number, id: number, ltp: number, tradedAtIso: string): ArrayBuffer {
  const view = header(2, segment, id, 8);
  view.setFloat32(8, ltp, true);
  view.setInt32(12, istSeconds(tradedAtIso), true);
  return view.buffer;
}

function quoteFrame(): ArrayBuffer {
  const view = header(4, 1, 2885, 42);
  view.setFloat32(8, 1240.0, true); // ltp
  view.setInt16(12, 25, true); // ltq
  view.setInt32(14, istSeconds('2026-09-16T09:59:58.000Z'), true); // ltt
  view.setFloat32(18, 1238.42, true); // atp
  view.setInt32(22, 6_543_210, true); // volume
  view.setInt32(26, 100, true); // total sell
  view.setInt32(30, 200, true); // total buy
  view.setFloat32(34, 1231.0, true); // open
  view.setFloat32(38, 1235.3, true); // close (previous)
  view.setFloat32(42, 1245.55, true); // high
  view.setFloat32(46, 1229.05, true); // low
  return view.buffer;
}

function previousCloseFrame(): ArrayBuffer {
  const view = header(6, 0, 13, 8);
  view.setFloat32(8, 23118.6, true);
  view.setInt32(12, 0, true);
  return view.buffer;
}

function disconnectFrame(reason: number): ArrayBuffer {
  const view = header(50, 0, 0, 2);
  view.setInt16(8, reason, true);
  return view.buffer;
}

describe('decodeFeedPacket', () => {
  it('decodes a ticker: float32 rupees → paise, IST wall-clock seconds → UTC instant', () => {
    const packet = decodeFeedPacket(tickerFrame(1, 2885, 1245.55, '2026-09-16T10:28:24.000Z'));
    expect(packet).toEqual({
      kind: 'ticker',
      ref: { segment: 'NSE_EQ', securityId: '2885' },
      ltp: 124555,
      lastTradedAt: new Date('2026-09-16T10:28:24.000Z'),
    });
  });

  it('decodes an index ticker on segment 0', () => {
    const packet = decodeFeedPacket(tickerFrame(0, 13, 23217.6, '2026-09-17T01:17:33.000Z'));
    expect(packet).toMatchObject({
      kind: 'ticker',
      ref: { segment: 'IDX_I', securityId: '13' },
      ltp: 2321760,
    });
  });

  it('decodes a quote with day OHLC and volume', () => {
    expect(decodeFeedPacket(quoteFrame())).toEqual({
      kind: 'quote',
      ref: { segment: 'NSE_EQ', securityId: '2885' },
      ltp: 124000,
      lastTradedQuantity: 25,
      lastTradedAt: new Date('2026-09-16T09:59:58.000Z'),
      averagePrice: 123842,
      volume: 6_543_210,
      totalSellQuantity: 100,
      totalBuyQuantity: 200,
      open: 123100,
      close: 123530,
      high: 124555,
      low: 122905,
    });
  });

  it('decodes previous close and a disconnect with its reason', () => {
    expect(decodeFeedPacket(previousCloseFrame())).toEqual({
      kind: 'previousClose',
      ref: { segment: 'IDX_I', securityId: '13' },
      previousClose: 2311860,
      previousOpenInterest: 0,
    });
    expect(decodeFeedPacket(disconnectFrame(807))).toEqual({
      kind: 'disconnect',
      code: 807,
      reason: 'Access token expired',
    });
    expect(isCredentialDisconnect(807)).toBe(true);
    expect(isCredentialDisconnect(805)).toBe(false);
  });

  it('treats a zero trade time as "no trade yet"', () => {
    const view = header(2, 1, 1, 8);
    view.setFloat32(8, 10, true);
    view.setInt32(12, 0, true);
    expect(decodeFeedPacket(view.buffer)).toMatchObject({ lastTradedAt: null });
  });

  it('never throws: short frames are null, unknown codes and segments are "other"', () => {
    expect(decodeFeedPacket(new ArrayBuffer(3))).toBeNull();
    expect(decodeFeedPacket(header(2, 1, 1, 2).buffer)).toBeNull(); // truncated ticker
    expect(decodeFeedPacket(header(5, 1, 1, 4).buffer)).toMatchObject({ kind: 'other' }); // OI
    expect(decodeFeedPacket(header(2, 4, 532540, 8).buffer)).toMatchObject({
      kind: 'other',
      header: { segmentCode: 4 }, // BSE_EQ: not an NSE app
    });
    // A Uint8Array view over a larger buffer decodes from its own offset.
    const backing = new Uint8Array(4 + 16);
    backing.set(new Uint8Array(tickerFrame(1, 7, 1, '2026-09-16T10:00:00.000Z')), 4);
    expect(decodeFeedPacket(backing.subarray(4))).toMatchObject({ ref: { securityId: '7' } });
  });
});

describe('encodeFeedRequests / feedUrl / parseSecurityKey', () => {
  it('chunks to the documented 100-instrument cap with the exact wire shape', () => {
    const refs = Array.from({ length: 205 }, (_, i) => ({
      segment: 'NSE_EQ' as const,
      securityId: String(i + 1),
    }));
    const messages = encodeFeedRequests(REQUEST_CODES.ticker.subscribe, refs);
    expect(messages).toHaveLength(3);
    const first = JSON.parse(messages[0] ?? '');
    expect(first.RequestCode).toBe(15);
    expect(first.InstrumentCount).toBe(MAX_INSTRUMENTS_PER_MESSAGE);
    expect(first.InstrumentList[0]).toEqual({ ExchangeSegment: 'NSE_EQ', SecurityId: '1' });
    expect(JSON.parse(messages[2] ?? '').InstrumentCount).toBe(5);
  });

  it('builds the documented URL', () => {
    expect(feedUrl({ clientId: '1103361782', accessToken: 'jwt' })).toBe(
      'wss://api-feed.dhan.co/?version=2&token=jwt&clientId=1103361782&authType=2',
    );
  });

  it('round-trips security keys and rejects other segments', () => {
    expect(parseSecurityKey('NSE_EQ:2885')).toEqual({ segment: 'NSE_EQ', securityId: '2885' });
    expect(parseSecurityKey('IDX_I:13')).toEqual({ segment: 'IDX_I', securityId: '13' });
    expect(parseSecurityKey('BSE_EQ:1')).toBeNull();
    expect(parseSecurityKey('garbage')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Transport over a fake socket
// ---------------------------------------------------------------------------

class FakeSocket implements FeedSocket {
  binaryType = 'blob';
  readonly sent: string[] = [];
  closed = false;
  private readonly listeners = new Map<string, ((event: never) => void)[]>();
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.emit('close', { code: 1000, reason: '' });
  }
  addEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
}

const session = { clientId: '1103361782', accessToken: 'jwt' };

function transportWithSocket(mode: 'ticker' | 'quote' = 'ticker') {
  const sockets: FakeSocket[] = [];
  const transport = new DhanFeedTransport(session, {
    mode,
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  return { transport, sockets };
}

describe('DhanFeedTransport', () => {
  it('connects in binary mode, subscribes in the chosen mode, and emits decoded packets', () => {
    const { transport, sockets } = transportWithSocket('quote');
    const packets: FeedPacket[] = [];
    const connected = vi.fn();
    transport.on('connect', connected);
    transport.on('message', (p) => packets.push(p as FeedPacket));
    transport.connect();

    const socket = sockets[0];
    expect(socket?.url).toContain('token=jwt');
    expect(socket?.binaryType).toBe('arraybuffer');
    socket?.emit('open');
    expect(connected).toHaveBeenCalledOnce();

    transport.subscribe(['NSE_EQ:2885', 'IDX_I:13', 'BSE_EQ:1']);
    const request = JSON.parse(socket?.sent[0] ?? '');
    expect(request.RequestCode).toBe(REQUEST_CODES.quote.subscribe);
    expect(request.InstrumentCount).toBe(2); // the BSE key is not ours and is dropped
    transport.unsubscribe(['IDX_I:13']);
    expect(JSON.parse(socket?.sent[1] ?? '').RequestCode).toBe(REQUEST_CODES.quote.unsubscribe);

    socket?.emit('message', { data: quoteFrame() });
    socket?.emit('message', { data: 'not binary' });
    expect(packets).toHaveLength(1);
    expect(packets[0]?.kind).toBe('quote');
  });

  it('surfaces a credential disconnect as an error before the close, and sends the disconnect code on close', () => {
    const { transport, sockets } = transportWithSocket();
    const errors: unknown[] = [];
    const closed = vi.fn();
    transport.on('error', (e) => errors.push(e));
    transport.on('close', closed);
    transport.connect();
    const socket = sockets[0];
    socket?.emit('open');

    socket?.emit('message', { data: disconnectFrame(807) });
    expect(errors[0]).toBeInstanceOf(DhanFeedError);
    expect((errors[0] as DhanFeedError).code).toBe(807);
    expect(closed).not.toHaveBeenCalled();

    transport.close();
    expect(socket?.sent.at(-1)).toBe(JSON.stringify({ RequestCode: REQUEST_CODES.disconnect }));
    expect(socket?.closed).toBe(true);
    expect(closed).toHaveBeenCalledOnce();
    // The server's complaint about OUR disconnect is not news.
    socket?.emit('error', new Error('abnormal closure'));
    expect(errors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// End to end through the shared reconnecting stream
// ---------------------------------------------------------------------------

describe('streamTicks', () => {
  it('turns ticker and quote packets into ticks and ignores the rest', () => {
    const { transport, sockets } = transportWithSocket();
    const ticks: unknown[] = [];
    const states: string[] = [];
    const stream = streamTicks(['NSE_EQ:2885'], (tick) => ticks.push(tick), {
      createTransport: () => transport,
      onStateChange: (s) => states.push(s),
      setTimeoutImpl: (() => 0) as unknown as typeof setTimeout,
      clearTimeoutImpl: () => undefined,
    });
    const socket = sockets[0];
    socket?.emit('open');
    expect(states).toEqual(['connecting', 'live']);
    expect(JSON.parse(socket?.sent[0] ?? '').InstrumentList).toEqual([
      { ExchangeSegment: 'NSE_EQ', SecurityId: '2885' },
    ]);

    socket?.emit('message', { data: previousCloseFrame() });
    socket?.emit('message', { data: tickerFrame(1, 2885, 1240, '2026-09-16T10:00:00.000Z') });
    socket?.emit('message', { data: quoteFrame() });
    expect(ticks).toEqual([
      {
        ref: { segment: 'NSE_EQ', securityId: '2885' },
        ltp: 124000,
        lastTradedAt: new Date('2026-09-16T10:00:00.000Z'),
        volume: null,
      },
      {
        ref: { segment: 'NSE_EQ', securityId: '2885' },
        ltp: 124000,
        lastTradedAt: new Date('2026-09-16T09:59:58.000Z'),
        volume: 6_543_210,
      },
    ]);
    stream.close();
    expect(stream.state()).toBe('closed');
  });
});
