/**
 * The market-data boundary.
 *
 * Business logic imports from here. It must never import `@equitywise/fyers` or any
 * other provider package directly.
 */

export type { RoutingConfig } from './config.js';
export {
  DEFAULT_ROUTES,
  FALLBACK_ENV_VAR,
  PROVIDER_ENV_VAR,
  ROUTE_ENV_VARS,
  ROUTED_PROVIDER_ID,
  readProviderSelection,
  readRoutingConfig,
} from './config.js';
export type {
  DealSide,
  DealType,
  DisclosureSource,
  InstitutionParticipant,
  OiBucket,
  OiParticipant,
  RawAnnouncement,
  RawDeal,
  RawDeliveryStat,
  RawFiiDiiFlow,
  RawParticipantOi,
  RawShareholding,
} from './disclosures.js';
export { OI_BUCKETS } from './disclosures.js';
export type { MarketDataFailure } from './errors.js';
export { isMarketDataProviderError, MarketDataProviderError } from './errors.js';
export type {
  BarsRequest,
  FuturesOiBar,
  FuturesOiRequest,
  MarketDataProvider,
  ProviderCapabilities,
  StreamRequest,
  StreamState,
  TickSubscription,
} from './provider.js';
export type {
  RoutedProvider,
  RoutedProviderOptions,
  RouteEvent,
  RouteName,
  RoutingTable,
} from './routed.js';
export { createRoutedProvider, ROUTE_NAMES } from './routed.js';
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
