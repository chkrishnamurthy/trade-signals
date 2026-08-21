import type {
  Candle as FyersCandle,
  FyersMarketStatus,
  Quote as FyersQuote,
  Instrument as FyersInstrument,
  Tick as FyersTick,
} from '@signal/fyers';
import type {
  Bar,
  Instrument,
  MarketPhase,
  MarketStatus,
  Quote,
  Tick,
} from '@signal/market-data';

/**
 * Fyers shapes to product shapes.
 *
 * `@signal/fyers` has already done the hard part — Zod-parsed the wire format
 * and converted every price to integer paise. This layer strips what remains of
 * the provider from the data: the `NSE:RELIANCE-EQ` symbol form, the `fyToken`,
 * and Fyers' own status vocabulary.
 */

export function toBar(candle: FyersCandle): Bar {
  return {
    timestamp: candle.timestamp.getTime(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

export function toInstrument(instrument: FyersInstrument): Instrument {
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    kind: instrument.kind,
    exchange: instrument.exchange,
    isin: instrument.isin,
    lotSize: instrument.lotSize,
    tickSize: instrument.tickSize,
    // Kept for rename-resilient ingestion; opaque above this line.
    providerRef: instrument.fyToken,
  };
}

export function toQuote(symbol: string, quote: FyersQuote): Quote {
  return {
    symbol,
    ltp: quote.ltp,
    change: quote.change,
    changePercent: quote.changePercent,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    averagePrice: quote.averagePrice,
    volume: quote.volume,
    timestamp: quote.timestamp,
  };
}

export function toTick(symbol: string, tick: FyersTick): Tick {
  return {
    symbol,
    ltp: tick.ltp,
    lastTradedAt: tick.lastTradedAt,
    exchangeFeedAt: tick.exchangeFeedAt,
    volumeToday: tick.volumeToday,
  };
}

/**
 * Fyers' session vocabulary to ours.
 *
 * `OPEN` alone maps to a phase the UI may badge as live. The auction phases are
 * distinct because a price printed during a call auction is not a continuous
 * trading price, and showing it as one is misleading.
 */
const PHASES: Readonly<Record<FyersMarketStatus, MarketPhase>> = {
  PREOPEN: 'pre_open',
  OPEN: 'open',
  CLOSE: 'closed',
  POSTCLOSE_START: 'post_close',
  CTS_CLOSE: 'closed',
  CAS_START: 'closing_auction',
  CAS_MKT_ORD_RESTRICT: 'closing_auction',
  CAS_END: 'post_close',
};

export function toMarketStatus(status: {
  isOpen: boolean;
  status: FyersMarketStatus | 'UNKNOWN';
  checkedAt: Date;
}): MarketStatus {
  const phase = status.status === 'UNKNOWN' ? 'unknown' : (PHASES[status.status] ?? 'unknown');
  return {
    // Trust the phase mapping, not the upstream boolean: they must not diverge.
    isOpen: phase === 'open',
    phase,
    checkedAt: status.checkedAt,
  };
}
