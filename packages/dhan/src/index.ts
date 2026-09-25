/**
 * Raw Dhan knowledge.
 *
 * The ONLY place a Dhan type, segment code, `securityId`, or endpoint may
 * appear. Business logic never imports this package; it imports
 * `@equitywise/market-data` and receives a `MarketDataProvider` built by
 * `@equitywise/providers-dhan` (CLAUDE.md: broker independence).
 */

export type { AuthDependencies, DhanCredentials, DhanProfile, MintedToken } from './auth.js';
export {
  base32Decode,
  fetchProfile,
  generateAccessToken,
  generateTotp,
  isExpiredTokenError,
  isTokenUsable,
  mintCooldownMs,
  parseExpiryTime,
  renewToken,
  TOKEN_LIFETIME_MS,
  tokenExpiry,
} from './auth.js';
export type { CandleFetcher, DateRange, DhanResolution } from './candles.js';
export {
  CHUNK_DAYS,
  chunkDaysFor,
  chunkRange,
  DAILY_HISTORY_START,
  fetchCandles,
  fetchFuturesCandles,
  INTRADAY_HISTORY_YEARS,
  INTRADAY_RESOLUTIONS,
  intradayHistoryStart,
  istDateTimeKey,
  requestDates,
} from './candles.js';
export {
  DHAN_ERROR_CODES,
  DhanApiError,
  DhanAuthError,
  DhanError,
  DhanRateLimitError,
  isSubscriptionCode,
  isTokenExpiryCode,
  TOKEN_EXPIRY_CODES,
} from './errors.js';
export type {
  BackoffOptions,
  DhanSession,
  HttpClientOptions,
  RateBucket,
  RequestOptions,
} from './http.js';
export {
  authHeaders,
  backoffDelay,
  createDataRateLimiter,
  createQuoteRateLimiter,
  DEFAULT_LIMITS,
  DHAN_API_BASE,
  DHAN_AUTH_BASE,
  DhanHttpClient,
  DOCUMENTED_LIMITS,
  redactedUrl,
} from './http.js';
export type { ParseInstrumentsResult } from './instruments.js';
export {
  COLUMNS,
  EQUITY_SERIES,
  InstrumentIndex,
  listInstruments,
  parseScripMaster,
  SCRIP_MASTER_URLS,
  splitCsvLine,
  tickSizePaise,
} from './instruments.js';
export type { FetchQuotesResult, Quote, QuoteFetcher } from './quotes.js';
export {
  chunkRefs,
  fetchQuotes,
  MAX_QUOTE_INSTRUMENTS,
  parseTradeTime,
  toQuote,
  toQuoteRequestBody,
} from './quotes.js';
export type {
  DhanStreamOptions,
  DhanTick,
  DhanTickStream,
  DisconnectPacket,
  FeedHeader,
  FeedMode,
  FeedPacket,
  FeedSocket,
  FeedTransportOptions,
  PreviousClosePacket,
  QuotePacket,
  TickerPacket,
} from './stream.js';
export {
  DHAN_FEED_URL,
  DhanFeedError,
  DhanFeedTransport,
  DISCONNECT_REASONS,
  decodeFeedHeader,
  decodeFeedPacket,
  encodeFeedRequests,
  feedUrl,
  isCredentialDisconnect,
  MAX_FEED_CONNECTIONS,
  MAX_FEED_INSTRUMENTS,
  MAX_INSTRUMENTS_PER_MESSAGE,
  parseSecurityKey,
  REQUEST_CODES,
  RESPONSE_CODES,
  streamTicks,
} from './stream.js';
export {
  FUTURES_INSTRUMENT,
  FUTURES_SEGMENT,
  INDEX_ALIASES,
  instrumentTypeFor,
  internalSymbolFor,
  normaliseTicker,
  segmentFor,
} from './symbols.js';
export type {
  Candle,
  ChartsResponse,
  EnvelopeError,
  Exchange,
  ExchangeSegment,
  FuturesCandle,
  FuturesContract,
  Instrument,
  InstrumentKind,
  InstrumentType,
  ProfileResponse,
  QuoteResponse,
  QuoteValue,
  SecurityRef,
} from './types.js';
export {
  chartsResponseSchema,
  EXCHANGE_SEGMENTS,
  envelopeError,
  errorEnvelopeSchema,
  generateTokenResponseSchema,
  profileResponseSchema,
  quoteResponseSchema,
  quoteValueSchema,
  securityKey,
  toCandles,
  toFuturesCandles,
} from './types.js';
