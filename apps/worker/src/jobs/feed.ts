import { type IntradayObservation, ORB_CONFIG } from '@equitywise/core';
import {
  invalidateProviderCredential,
  observeIntradayPrice,
  setWorkerCheckpoint,
  signalUniverseInstruments,
  upsertInstrumentProviderRef,
} from '@equitywise/db';
import type {
  InstrumentRef,
  MarketDataProvider,
  MarketDataProviderError,
  StreamState,
  Tick,
  TickSubscription,
} from '@equitywise/market-data';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { loadIndexConstituents } from '../universe.js';
import { loadIntradaySettings } from './intraday-orb.js';
import { refreshProviderCredential } from './refresh-credential.js';

/**
 * The live price feed (docs/planning/paper-trading-plan.md §9.1 `feed`).
 *
 * One socket for the strategy universe, open from 09:05 to 15:35 on trading
 * days. Ticks are coalesced to at most one observation per instrument per
 * second — the engine's coverage rule is 15 s, a tick every second is far
 * inside it, and one row per trade on fifty liquid names would be tens of
 * thousands of rows an hour that nobody reads. Every observation goes through
 * `observeIntradayPrice`, which owns ordering, continuity and the per-instrument
 * lock; a REST sample arriving for the same instant is dropped there, so the
 * 5-second quote sweep can keep running as the fallback without double-writing.
 *
 * Reconnect, resubscribe and the heartbeat watchdog live in the shared
 * reconnecting stream; this job only decides when the socket should exist and
 * what to do with what it delivers.
 */
export interface FeedStatus {
  running: boolean;
  state: StreamState | 'stopped';
  provider: string | null;
  lastTickAt: number | null;
  lastObservationAt: number | null;
  ticks: number;
  observations: number;
  dropped: number;
  reconnects: number;
  subscribed: number;
  /** Why the feed is not delivering, in one line, when it is not. */
  note: string | null;
}

export interface FeedJob {
  start(): Promise<void>;
  stop(): void;
  status(): FeedStatus;
  /** True when the socket is live and delivered a tick inside the coverage window. */
  healthy(now?: number): boolean;
}

export interface FeedOptions {
  /** The provider whose socket to use; defaults to Dhan when built, else the active provider. */
  provider?: MarketDataProvider;
  flushIntervalMs?: number;
  now?: () => number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}

export const FEED_PROVIDER_ID = 'dhan';

export function createFeedJob(
  context: WorkerContext,
  log: Logger,
  options: FeedOptions = {},
): FeedJob {
  const now = options.now ?? (() => Date.now());
  const flushIntervalMs = options.flushIntervalMs ?? 1_000;
  const setIntervalImpl = options.setInterval ?? setInterval;
  const clearIntervalImpl = options.clearInterval ?? clearInterval;
  const provider =
    options.provider ??
    [context.providers.get(FEED_PROVIDER_ID), context.provider].find(
      (p): p is MarketDataProvider =>
        p?.capabilities.streaming === true && p.streamTicks !== undefined,
    ) ??
    null;

  let subscription: TickSubscription | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;
  let lastCredentialRecovery = 0;
  const status: FeedStatus = {
    running: false,
    state: 'stopped',
    provider: provider?.id ?? null,
    lastTickAt: null,
    lastObservationAt: null,
    ticks: 0,
    observations: 0,
    dropped: 0,
    reconnects: 0,
    subscribed: 0,
    note: null,
  };
  /**
   * The feed's state is written to `worker_checkpoints('feed')` so the page
   * and the health view can say "Dhan · reconnecting · last tick 40 s ago"
   * instead of guessing from the absence of prices. At most one write per 5 s.
   */
  let lastPublished = 0;
  const publish = async (force = false) => {
    const at = now();
    if (!force && at - lastPublished < 5_000) return;
    lastPublished = at;
    try {
      await setWorkerCheckpoint(db(), 'feed', { ...status }, at);
    } catch (error) {
      log.warn('feed status not recorded', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const db = () => context.db;
  const instrumentBySymbol = new Map<string, number>();
  /** The newest usable tick per instrument since the last flush. */
  const pending = new Map<number, Omit<IntradayObservation, 'continuous'>>();

  const onTick = (tick: Tick) => {
    const receivedAt = now();
    status.ticks += 1;
    status.lastTickAt = receivedAt;
    const instrumentId = instrumentBySymbol.get(tick.symbol);
    const at = tick.lastTradedAt?.getTime() ?? null;
    if (
      instrumentId === undefined ||
      at === null ||
      at > receivedAt ||
      receivedAt - at > ORB_CONFIG.coverageGapMs ||
      !Number.isSafeInteger(tick.ltp) ||
      tick.ltp <= 0
    ) {
      status.dropped += 1;
      return;
    }
    const current = pending.get(instrumentId);
    if (current && current.at > at) return;
    pending.set(instrumentId, { at, receivedAt, price: tick.ltp });
  };

  const flush = async () => {
    if (flushing || pending.size === 0) return;
    flushing = true;
    const batch = [...pending];
    pending.clear();
    try {
      let next = 0;
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          // (one writer per instrument at a time; four in flight overall)
          while (next < batch.length) {
            const item = batch[next++];
            if (!item) break;
            const [instrumentId, observation] = item;
            try {
              await observeIntradayPrice(context.db, instrumentId, observation, null, null);
              status.observations += 1;
              status.lastObservationAt = observation.receivedAt;
            } catch (error) {
              status.dropped += 1;
              log.warn('observation not recorded', {
                instrumentId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }),
      );
    } finally {
      flushing = false;
      void publish();
    }
  };

  const onError = async (error: MarketDataProviderError) => {
    log.warn('feed error', { failure: error.failure, error: error.message });
    status.note = `${error.failure}: ${error.message}`.slice(0, 200);
    void publish();
    if (error.failure !== 'auth' || provider === null) return;
    if (now() - lastCredentialRecovery < 600_000) return;
    lastCredentialRecovery = now();
    try {
      await invalidateProviderCredential(context.db, provider.id);
      await refreshProviderCredential(context, log, { providerId: provider.id });
    } catch (recoveryError) {
      log.error('feed credential recovery failed', {
        error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
      });
    }
  };

  /** Records which provider id maps to each instrument, for the operator's reconciliation. */
  const refreshProviderRefs = async (refs: readonly InstrumentRef[]) => {
    if (provider === null) return;
    try {
      const listed = await provider.listInstruments();
      const bySymbol = new Map(listed.map((i) => [`${i.kind}:${i.symbol}`, i.providerRef]));
      let written = 0;
      for (const ref of refs) {
        const providerRef = bySymbol.get(`${ref.kind}:${ref.symbol}`);
        const instrumentId = instrumentBySymbol.get(ref.symbol);
        if (!providerRef || instrumentId === undefined) continue;
        await upsertInstrumentProviderRef(
          context.db,
          instrumentId,
          provider.id,
          providerRef,
          now(),
        );
        written += 1;
      }
      log.info('provider refs refreshed', { provider: provider.id, written });
    } catch (error) {
      log.warn('provider refs not refreshed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return {
    async start() {
      if (status.running) return;
      if (provider === null || provider.streamTicks === undefined) {
        status.note =
          'No streaming provider is built (DHAN_CLIENT_ID missing?); the 5-second quote sweep is the only source.';
        log.warn('no streaming provider; the 5-second quote sweep remains the only source');
        await publish(true);
        return;
      }
      const config = await loadIntradaySettings();
      if (!config.enabled) {
        status.note = 'The intraday scanner is disabled in config/intraday-orb.yaml.';
        await publish(true);
        return;
      }
      status.note = null;
      const universe = await loadIndexConstituents(config.universe);
      const instruments = await signalUniverseInstruments(context.db);
      instrumentBySymbol.clear();
      const refs: InstrumentRef[] = [];
      for (const item of universe) {
        // The intraday universe is an NSE index; a BSE listing of the same
        // symbol is a different instrument and must not take its id.
        const instrument = instruments.find(
          (i) => i.symbol === item.symbol && i.kind === 'equity' && i.exchange === 'NSE',
        );
        if (!instrument) continue;
        instrumentBySymbol.set(item.symbol, instrument.id);
        refs.push({ symbol: item.symbol, kind: 'equity' });
      }
      status.running = true;
      status.subscribed = refs.length;
      status.state = 'connecting';
      subscription = provider.streamTicks({
        refs,
        onTick,
        onStateChange: (state) => {
          if (state === 'reconnecting') status.reconnects += 1;
          status.state = state;
          log.info('feed state', { state, reconnects: status.reconnects });
          void publish(true);
        },
        onError: (error) => void onError(error),
      });
      timer = setIntervalImpl(() => void flush(), flushIntervalMs);
      log.info('feed started', { provider: provider.id, subscribed: refs.length });
      await publish(true);
      void refreshProviderRefs(refs);
    },
    stop() {
      if (!status.running) return;
      subscription?.stop();
      subscription = null;
      if (timer !== null) clearIntervalImpl(timer);
      timer = null;
      pending.clear();
      status.running = false;
      status.state = 'stopped';
      log.info('feed stopped', { ticks: status.ticks, observations: status.observations });
      void publish(true);
    },
    status: () => ({ ...status }),
    healthy: (at = now()) =>
      status.running &&
      status.state === 'live' &&
      status.lastTickAt !== null &&
      at - status.lastTickAt <= ORB_CONFIG.coverageGapMs,
  };
}
