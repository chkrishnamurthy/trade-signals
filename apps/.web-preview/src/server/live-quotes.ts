import 'server-only';
import type {
  InstrumentRef,
  MarketDataProvider,
  StreamState,
  TickSubscription,
} from '@equitywise/market-data';
import type { LiveBatchDto, LiveQuoteDto, LiveSourceState } from '@/lib/watchlist-types';
import { getMarketStatus } from './market-status';
import { getProvider } from './provider';

/**
 * The live quote hub — one upstream feed, fanned out to every open watchlist.
 *
 * This is the fan-in the scaling plan calls for
 * (`docs/planning/market-data-scaling-plan.md`): Fyers load must scale with
 * the number of DISTINCT instruments on screen, never with the number of
 * users looking at them. Ten browsers watching the same fifty names cost one
 * socket subscription of fifty symbols, not ten of anything.
 *
 * Two sources, in order of preference:
 *
 *   socket   `provider.streamTicks` — every trade, as it prints. This is what
 *            makes a price move every second like it does on a terminal.
 *   poll     `provider.fetchQuotes` on a fixed cadence — used while the socket
 *            is not live (connecting, reconnecting, disabled, or over the
 *            per-connection symbol cap), and for the pre-open session where the
 *            socket is too quiet to keep its own heartbeat alive.
 *
 * Ticks are COALESCED to one flush per second per client. A liquid name can
 * print thirty times a second; nobody can read thirty updates a second, and
 * pushing them would spend the browser's main thread on nothing.
 *
 * Nothing here is ever the source of a stored price. The hub's memory is the
 * last tick per symbol and lives exactly as long as someone is watching.
 */

export type LiveBatch = LiveBatchDto;

export interface LiveSubscription {
  /** Stops delivery. Idempotent. The last subscriber out closes the upstream. */
  release(): void;
}

/** How often coalesced ticks are pushed to clients. */
const FLUSH_MS = 1_000;
/**
 * REST cadence while the socket is not live. Costs one request per fifty
 * symbols per interval against a 100/min budget shared with everything else
 * this process does — 3 s for a hundred names is 40/min, which leaves room.
 */
const POLL_MS = 3_000;
/** How often to re-check the session when the market is closed. */
const CLOSED_CHECK_MS = 30_000;
/** Keep the upstream open this long after the last client leaves. */
const IDLE_GRACE_MS = 10_000;
/**
 * A connected socket that has printed nothing for this long is not covering
 * its symbols. During a session a subscription of any liquid name ticks many
 * times a second; silence means a rejected credential or a half-open
 * connection the wrapper has not yet noticed, and the poll fills in meanwhile.
 */
const STREAM_SILENCE_MS = 10_000;

interface Client {
  readonly symbols: ReadonlySet<string>;
  readonly deliver: (batch: LiveBatch) => void;
}

interface ActiveStream {
  readonly provider: MarketDataProvider;
  readonly subscription: TickSubscription;
  /**
   * What is on the socket, by symbol. The ref is kept so an unsubscribe
   * encodes exactly as the subscribe did — an index and an equity differ.
   */
  readonly symbols: Map<string, InstrumentRef>;
}

class LiveQuoteHub {
  private readonly clients = new Set<Client>();
  private readonly refs = new Map<string, InstrumentRef>();
  private readonly refcount = new Map<string, number>();
  /** Last quote seen per symbol, for new subscribers' first frame. */
  private readonly last = new Map<string, LiveQuoteDto>();
  private readonly pending = new Map<string, LiveQuoteDto>();

  private stream: ActiveStream | null = null;
  private streamState: StreamState = 'stopped';
  /** When the socket last went live; the silence clock until the first tick. */
  private liveSince = 0;
  private marketOpen = false;
  private prePoll = false;

  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private looping = false;

  subscribe(refs: readonly InstrumentRef[], deliver: (batch: LiveBatch) => void): LiveSubscription {
    const symbols = new Set<string>();
    for (const ref of refs) {
      symbols.add(ref.symbol);
      this.refs.set(ref.symbol, ref);
      this.refcount.set(ref.symbol, (this.refcount.get(ref.symbol) ?? 0) + 1);
    }
    const client: Client = { symbols, deliver };
    this.clients.add(client);

    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.start();

    // First frame: whatever the hub already knows, so a second tab does not
    // wait for the next trade to show a price.
    const known: LiveQuoteDto[] = [];
    for (const symbol of symbols) {
      const quote = this.last.get(symbol);
      if (quote !== undefined) known.push(quote);
    }
    deliver({ state: this.sourceState(), quotes: known });

    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.clients.delete(client);
        for (const symbol of symbols) {
          const count = (this.refcount.get(symbol) ?? 1) - 1;
          if (count <= 0) {
            this.refcount.delete(symbol);
            this.refs.delete(symbol);
            this.last.delete(symbol);
            this.pending.delete(symbol);
          } else {
            this.refcount.set(symbol, count);
          }
        }
        this.syncStreamSymbols();
        if (this.clients.size === 0) {
          this.idleTimer = setTimeout(() => this.stop(), IDLE_GRACE_MS);
        }
      },
    };
  }

  // --- Lifecycle ------------------------------------------------------------

  private start(): void {
    if (this.flushTimer === null) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_MS);
    }
    if (!this.looping) {
      this.looping = true;
      void this.loop();
    } else {
      // A new symbol set while the loop is between iterations: push it to the
      // socket now rather than up to POLL_MS later.
      this.syncStreamSymbols();
    }
  }

  private stop(): void {
    this.idleTimer = null;
    if (this.clients.size > 0) return;
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    this.looping = false;
    this.closeStream();
    this.pending.clear();
  }

  /**
   * The control loop: decides, on a cadence, whether the socket should be up
   * and whether a REST poll is needed to cover for it.
   */
  private async loop(): Promise<void> {
    this.loopTimer = null;
    if (this.clients.size === 0) {
      this.looping = false;
      return;
    }

    let delay = POLL_MS;
    try {
      const status = await getMarketStatus();
      const wasOpen = this.marketOpen;
      this.marketOpen = status?.isOpen === true;
      // Pre-open prints prices but too rarely to keep a socket's heartbeat
      // satisfied; poll it instead.
      this.prePoll = status?.phase === 'pre_open';

      if (!this.marketOpen) {
        if (wasOpen) this.closeStream();
        if (this.prePoll) {
          await this.poll([...this.refcount.keys()]);
        } else {
          delay = CLOSED_CHECK_MS;
          if (wasOpen) this.broadcastState();
        }
      } else {
        const provider = await getProvider();
        this.ensureStream(provider);
        const uncovered = this.uncoveredSymbols();
        if (uncovered.length > 0) await this.poll(uncovered, provider);
      }
    } catch {
      // A provider that cannot be built (no credential yet) or a failed poll
      // is a quiet frame, not a crash; the next iteration tries again.
    }

    if (this.clients.size > 0) {
      this.loopTimer = setTimeout(() => void this.loop(), delay);
    } else {
      this.looping = false;
    }
  }

  // --- Socket ---------------------------------------------------------------

  private ensureStream(provider: MarketDataProvider): void {
    if (provider.streamTicks === undefined || !provider.capabilities.streaming) return;

    // A rotated credential means a new provider; the old socket would keep
    // reconnecting with a dead token.
    if (this.stream !== null && this.stream.provider !== provider) this.closeStream();
    if (this.stream !== null) {
      this.syncStreamSymbols();
      return;
    }

    const symbols = this.streamableSymbols(provider);
    const refs = symbols.map((symbol) => this.refs.get(symbol)).filter(isRef);
    const subscription = provider.streamTicks({
      refs,
      onTick: (tick) => {
        this.record({
          symbol: tick.symbol,
          ltp: tick.ltp,
          volume: tick.volumeToday,
          at: (tick.exchangeFeedAt ?? new Date()).toISOString(),
        });
      },
      onStateChange: (state) => {
        const before = this.sourceState();
        this.streamState = state;
        if (state === 'live') this.liveSince = Date.now();
        if (this.sourceState() !== before) this.broadcastState();
      },
      onError: () => {
        // The wrapper reconnects on its own; the poll covers the gap.
      },
    });
    this.stream = {
      provider,
      subscription,
      symbols: new Map(refs.map((ref) => [ref.symbol, ref])),
    };
    this.streamState = subscription.state();
  }

  private closeStream(): void {
    if (this.stream === null) return;
    this.stream.subscription.stop();
    this.stream = null;
    this.streamState = 'stopped';
  }

  /** Brings the socket's subscription in line with what clients want. */
  private syncStreamSymbols(): void {
    const stream = this.stream;
    if (stream === null) return;

    const wanted = new Set(this.streamableSymbols(stream.provider));
    const add: InstrumentRef[] = [];
    const drop: InstrumentRef[] = [];
    for (const symbol of wanted) {
      if (stream.symbols.has(symbol)) continue;
      const ref = this.refs.get(symbol);
      if (ref !== undefined) add.push(ref);
    }
    for (const [symbol, ref] of stream.symbols) {
      if (!wanted.has(symbol)) drop.push(ref);
    }
    if (drop.length > 0) {
      stream.subscription.unsubscribe(drop);
      for (const ref of drop) stream.symbols.delete(ref.symbol);
    }
    if (add.length > 0) {
      stream.subscription.subscribe(add);
      for (const ref of add) stream.symbols.set(ref.symbol, ref);
    }
  }

  /** The wanted symbols that fit under the socket's per-connection cap. */
  private streamableSymbols(provider: MarketDataProvider): string[] {
    const cap = provider.capabilities.maxStreamSymbols ?? Number.POSITIVE_INFINITY;
    return [...this.refcount.keys()].slice(0, cap);
  }

  /** Symbols the socket is not currently delivering, so REST must. */
  private uncoveredSymbols(): string[] {
    if (!this.streamDelivering()) return [...this.refcount.keys()];
    const covered = this.stream?.symbols ?? new Map<string, InstrumentRef>();
    return [...this.refcount.keys()].filter((symbol) => !covered.has(symbol));
  }

  /** Live, and either recently ticked or only just connected. */
  private streamDelivering(): boolean {
    if (this.stream === null || this.streamState !== 'live') return false;
    const lastMessage = this.stream.subscription.lastMessageAt()?.getTime() ?? this.liveSince;
    return Date.now() - Math.max(lastMessage, this.liveSince) < STREAM_SILENCE_MS;
  }

  // --- Poll -----------------------------------------------------------------

  private async poll(symbols: readonly string[], provider?: MarketDataProvider): Promise<void> {
    if (symbols.length === 0) return;
    const refs = symbols.map((symbol) => this.refs.get(symbol)).filter(isRef);
    const source = provider ?? (await getProvider());
    const result = await source.fetchQuotes(refs);
    const at = new Date().toISOString();
    for (const [symbol, quote] of result.quotes) {
      this.record({ symbol, ltp: quote.ltp, volume: quote.volume, at });
    }
  }

  // --- Delivery -------------------------------------------------------------

  private record(quote: LiveQuoteDto): void {
    const previous = this.last.get(quote.symbol);
    // Only a CHANGE is worth a frame: a poll that returns the same price is
    // not news, and a client that receives it would flash a cell for nothing.
    if (previous !== undefined && previous.ltp === quote.ltp && previous.volume === quote.volume) {
      return;
    }
    this.last.set(quote.symbol, quote);
    this.pending.set(quote.symbol, quote);
  }

  private flush(): void {
    if (this.pending.size === 0) return;
    const state = this.sourceState();
    for (const client of this.clients) {
      const quotes: LiveQuoteDto[] = [];
      for (const [symbol, quote] of this.pending) {
        if (client.symbols.has(symbol)) quotes.push(quote);
      }
      if (quotes.length > 0) client.deliver({ state, quotes });
    }
    this.pending.clear();
  }

  private broadcastState(): void {
    const state = this.sourceState();
    for (const client of this.clients) client.deliver({ state, quotes: [] });
  }

  private sourceState(): LiveSourceState {
    if (!this.marketOpen && !this.prePoll) return 'closed';
    return this.streamDelivering() ? 'streaming' : 'polling';
  }
}

function isRef(ref: InstrumentRef | undefined): ref is InstrumentRef {
  return ref !== undefined;
}

/**
 * One hub per process. Held on `globalThis` so Next's dev-mode module reloads
 * do not open a second socket beside the first.
 */
const HUB_KEY = Symbol.for('equitywise.liveQuoteHub');

export function liveQuoteHub(): LiveQuoteHub {
  const holder = globalThis as { [HUB_KEY]?: LiveQuoteHub };
  holder[HUB_KEY] ??= new LiveQuoteHub();
  return holder[HUB_KEY];
}
