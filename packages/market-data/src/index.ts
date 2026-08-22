/**
 * The market-data boundary.
 *
 * Business logic imports from here. It must never import `@wealthos/fyers` or any
 * other provider package directly.
 */
export type { MarketDataFailure } from './errors.js';
export { isMarketDataProviderError, MarketDataProviderError } from './errors.js';
export type {
  BarsRequest,
  MarketDataProvider,
  ProviderCapabilities,
  StreamRequest,
  StreamState,
  TickSubscription,
} from './provider.js';
export type {
  Bar,
  DateRange,
  Exchange,
  Instrument,
  InstrumentKind,
  InstrumentRef,
  MarketPhase,
  MarketStatus,
  Quote,
  QuotesResult,
  Resolution,
  Tick,
} from './types.js';
export { ALL_RESOLUTIONS, isDailyOrSlower } from './types.js';
