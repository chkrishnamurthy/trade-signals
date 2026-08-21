import { describe, expect, it } from 'vitest';
import { MAX_SUBSCRIPTION_SYMBOLS, streamTicks, type TickTransport } from '../stream.js';
import type { Tick } from '../types.js';

/** A transport we drive by hand, recording everything the stream asks of it. */
class FakeTransport implements TickTransport {
  readonly subscribed: string[][] = [];
  readonly unsubscribed: string[][] = [];
  connectCalls = 0;
  closeCalls = 0;
  private handlers = new Map<string, ((arg: never) => void)[]>();

  connect(): void {
    this.connectCalls += 1;
  }
  close(): void {
    this.closeCalls += 1;
  }
  subscribe(symbols: string[]): void {
    this.subscribed.push([...symbols]);
  }
  unsubscribe(symbols: string[]): void {
    this.unsubscribed.push([...symbols]);
  }
  on(event: string, handler: (arg: never) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }
  emit(event: string, arg?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      (handler as (a: unknown) => void)(arg);
    }
  }
}

/** Manual timer control so reconnect/heartbeat tests are deterministic. */
function fakeTimers() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  const setTimeoutImpl = ((fn: () => void) => {
    const id = nextId++;
    pending.set(id, fn);
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  const clearTimeoutImpl = ((id: number) => {
    pending.delete(id);
  }) as unknown as typeof clearTimeout;
  const runAll = (): void => {
    for (const [id, fn] of [...pending]) {
      pending.delete(id);
      fn();
    }
  };
  return { setTimeoutImpl, clearTimeoutImpl, runAll, pendingCount: () => pending.size };
}

function harness(symbols: string[] = ['NSE:RELIANCE-EQ']) {
  const transports: FakeTransport[] = [];
  const ticks: Tick[] = [];
  const errors: unknown[] = [];
  const states: string[] = [];
  const timers = fakeTimers();

  const stream = streamTicks(symbols, (tick) => ticks.push(tick), {
    createTransport: () => {
      const t = new FakeTransport();
      transports.push(t);
      return t;
    },
    onError: (e) => errors.push(e),
    onStateChange: (s) => states.push(s),
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl,
    random: () => 0.5,
  });

  return { stream, transports, ticks, errors, states, timers, current: () => transports.at(-1) };
}

describe('streamTicks — connection', () => {
  it('connects immediately and subscribes on connect', () => {
    const h = harness(['NSE:RELIANCE-EQ', 'NSE:NIFTY50-INDEX']);
    expect(h.current()?.connectCalls).toBe(1);

    h.current()?.emit('connect');
    expect(h.stream.state()).toBe('live');
    expect(h.current()?.subscribed).toEqual([['NSE:RELIANCE-EQ', 'NSE:NIFTY50-INDEX']]);
  });

  it('normalises and forwards lite ticks', () => {
    const h = harness();
    h.current()?.emit('connect');
    h.current()?.emit('message', { symbol: 'NSE:RELIANCE-EQ', ltp: 1245.5, type: 'sf' });

    expect(h.ticks).toHaveLength(1);
    expect(h.ticks[0]).toMatchObject({
      symbol: 'RELIANCE',
      fyersSymbol: 'NSE:RELIANCE-EQ',
      ltp: 124550,
    });
  });

  it('ignores control frames that share the message channel', () => {
    const h = harness();
    h.current()?.emit('connect');
    h.current()?.emit('message', { s: 'ok', message: 'subscribed' });
    h.current()?.emit('message', { symbol: 'NSE:SBIN-EQ', type: 'sf' });
    expect(h.ticks).toHaveLength(0);
  });

  it('reports transport errors without tearing down', () => {
    const h = harness();
    h.current()?.emit('connect');
    h.current()?.emit('error', new Error('transient'));
    expect(h.errors).toHaveLength(1);
    expect(h.stream.state()).toBe('live');
  });
});

describe('streamTicks — reconnect', () => {
  it('reconnects after an unexpected close', () => {
    const h = harness();
    h.current()?.emit('connect');
    h.current()?.emit('close');

    expect(h.stream.state()).toBe('reconnecting');
    h.timers.runAll();
    expect(h.transports).toHaveLength(2);
    expect(h.transports[1]?.connectCalls).toBe(1);
  });

  it('resubscribes the FULL symbol set on reconnect, not just the delta', () => {
    const h = harness(['NSE:RELIANCE-EQ']);
    h.current()?.emit('connect');

    h.stream.subscribe(['NSE:INFY-EQ']);
    expect(h.transports[0]?.subscribed).toEqual([['NSE:RELIANCE-EQ'], ['NSE:INFY-EQ']]);

    h.current()?.emit('close');
    h.timers.runAll();
    h.transports[1]?.emit('connect');

    // The socket keeps no state across connections: everything must go again.
    expect(h.transports[1]?.subscribed).toEqual([['NSE:RELIANCE-EQ', 'NSE:INFY-EQ']]);
  });

  it('backs off exponentially while failures continue', () => {
    const delays: number[] = [];
    const transports: FakeTransport[] = [];
    const timers = (() => {
      let nextId = 1;
      const pending = new Map<number, () => void>();
      return {
        set: ((fn: () => void, ms: number) => {
          delays.push(ms);
          const id = nextId++;
          pending.set(id, fn);
          return id as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof setTimeout,
        clear: ((id: number) => pending.delete(id)) as unknown as typeof clearTimeout,
        runAll: () => {
          for (const [id, fn] of [...pending]) {
            pending.delete(id);
            fn();
          }
        },
      };
    })();

    const stream = streamTicks(['NSE:RELIANCE-EQ'], () => {}, {
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      reconnectDelayMs: 1000,
      maxReconnectDelayMs: 16_000,
      setTimeoutImpl: timers.set,
      clearTimeoutImpl: timers.clear,
      random: () => 1,
      heartbeatTimeoutMs: 30_000,
    });

    for (let i = 0; i < 5; i += 1) {
      transports.at(-1)?.emit('close');
      timers.runAll();
    }

    // Reconnect delays only (heartbeat is not armed without a 'connect').
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16_000]);
    stream.close();
  });

  it('resets the backoff after a successful connect', () => {
    const h = harness();
    h.current()?.emit('connect');
    h.current()?.emit('close');
    h.timers.runAll();
    h.transports[1]?.emit('connect'); // success resets the counter
    h.transports[1]?.emit('close');
    h.timers.runAll();
    expect(h.transports).toHaveLength(3);
  });

  it('gives up after maxReconnectAttempts', () => {
    const transports: FakeTransport[] = [];
    const errors: unknown[] = [];
    const timers = fakeTimers();
    const stream = streamTicks(['NSE:RELIANCE-EQ'], () => {}, {
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      maxReconnectAttempts: 2,
      onError: (e) => errors.push(e),
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    for (let i = 0; i < 4; i += 1) {
      transports.at(-1)?.emit('close');
      timers.runAll();
    }

    expect(stream.state()).toBe('closed');
    expect(errors.some((e) => e instanceof Error && /Giving up/.test(e.message))).toBe(true);
  });
});

describe('streamTicks — heartbeat watchdog', () => {
  it('treats silence as death and reconnects', () => {
    const h = harness();
    h.current()?.emit('connect');
    expect(h.transports).toHaveLength(1);

    // Fire the armed heartbeat timer without any intervening message.
    h.timers.runAll();

    expect(h.errors.some((e) => e instanceof Error && /No tick for/.test(e.message))).toBe(true);
    h.timers.runAll(); // run the scheduled reconnect
    expect(h.transports).toHaveLength(2);
  });

  it('a message postpones the watchdog', () => {
    const h = harness();
    h.current()?.emit('connect');
    h.current()?.emit('message', { symbol: 'NSE:RELIANCE-EQ', ltp: 100, type: 'sf' });

    // Exactly one timer is pending — the re-armed heartbeat, not a stale one.
    expect(h.timers.pendingCount()).toBe(1);
    expect(h.errors).toHaveLength(0);
  });

  it('stops the watchdog on close', () => {
    const h = harness();
    h.current()?.emit('connect');
    h.stream.close();
    expect(h.timers.pendingCount()).toBe(0);
    expect(h.stream.state()).toBe('closed');
    expect(h.current()?.closeCalls).toBe(1);
  });
});

describe('streamTicks — subscription management', () => {
  it('tracks the subscribed set', () => {
    const h = harness(['NSE:RELIANCE-EQ']);
    h.current()?.emit('connect');
    h.stream.subscribe(['NSE:INFY-EQ', 'NSE:RELIANCE-EQ']); // duplicate is a no-op
    expect(h.stream.symbols().sort()).toEqual(['NSE:INFY-EQ', 'NSE:RELIANCE-EQ']);
    expect(h.current()?.subscribed).toEqual([['NSE:RELIANCE-EQ'], ['NSE:INFY-EQ']]);
  });

  it('unsubscribes only what was actually subscribed', () => {
    const h = harness(['NSE:RELIANCE-EQ']);
    h.current()?.emit('connect');
    h.stream.unsubscribe(['NSE:INFY-EQ']); // never subscribed
    expect(h.current()?.unsubscribed).toEqual([]);
    h.stream.unsubscribe(['NSE:RELIANCE-EQ']);
    expect(h.current()?.unsubscribed).toEqual([['NSE:RELIANCE-EQ']]);
    expect(h.stream.symbols()).toEqual([]);
  });

  it('refuses to exceed the 200-symbol socket limit', () => {
    const many = Array.from({ length: MAX_SUBSCRIPTION_SYMBOLS + 1 }, (_, i) => `NSE:S${i}-EQ`);
    expect(() => harness(many)).toThrow(/exceeds the 200-symbol/);

    const h = harness(Array.from({ length: MAX_SUBSCRIPTION_SYMBOLS }, (_, i) => `NSE:S${i}-EQ`));
    h.current()?.emit('connect');
    expect(() => h.stream.subscribe(['NSE:ONEMORE-EQ'])).toThrow(/exceeds the 200-symbol/);
  });
});
