export type { AutoLoginDeps, CachedToken, FyersCredentials } from './auth.js';
export {
  AUTOMATED_LOGIN_CAVEAT,
  appIdHash,
  autoLogin,
  base32Decode,
  buildAuthCodeUrl,
  defaultExpiry,
  exchangeAuthCode,
  generateTotp,
  isTokenUsable,
  readCachedToken,
  writeCachedToken,
} from './auth.js';
export type { CandleFetcher, DateRange, FetchCandlesOptions, FyersResolution } from './candles.js';
export {
  CHUNK_DAYS,
  chunkDaysFor,
  chunkRange,
  fetchCandles,
  HISTORY_EPOCH_START,
} from './candles.js';
export {
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  PathCircuitBreaker,
  parseRetryAfter,
} from './circuit.js';
export {
  FYERS_ERROR_CODES,
  FyersApiError,
  FyersAuthError,
  FyersError,
  FyersRateLimitError,
  isTokenExpiryCode,
  TOKEN_EXPIRY_CODES,
} from './errors.js';
export type { BackoffOptions, HttpClientOptions, RequestOptions } from './http.js';
export {
  backoffDelay,
  FYERS_API_BASE,
  FYERS_DATA_BASE,
  FYERS_V3_BASE,
  FyersHttpClient,
} from './http.js';
export type { ParseInstrumentsResult } from './instruments.js';
export {
  COLUMNS,
  EXPECTED_COLUMN_COUNT,
  INSTRUMENT_TYPE,
  listInstruments,
  parseSymbolMaster,
  SYMBOL_MASTER_URLS,
  splitCsvLine,
} from './instruments.js';
export type {
  FetchQuotesResult,
  FyersMarketStatus,
  MarketStatus,
  Quote,
  QuoteFetcher,
  QuotesResponse,
} from './quotes.js';
export {
  chunkSymbols,
  fetchMarketStatus,
  fetchQuotes,
  MAX_QUOTE_SYMBOLS,
  marketStatusResponseSchema,
  quotesResponseSchema,
  toQuote,
} from './quotes.js';
export type { RateLimits, TokenBucketOptions } from './rate-limit.js';
export {
  DEFAULT_LIMITS,
  DOCUMENTED_LIMITS,
  RateLimiter,
} from './rate-limit.js';
export type { StreamOptions, StreamState, TickStream, TickTransport } from './stream.js';
export {
  FYERS_DATA_SOCKET_URL,
  MAX_SUBSCRIPTION_SYMBOLS,
  streamTicks,
} from './stream.js';
export type { ParsedFyersSymbol } from './symbols.js';
export {
  encodeFyersSymbol,
  internalSymbolFor,
  isFyersSymbol,
  NSE_PREFIX,
  parseFyersSymbol,
  SYMBOL_ALIASES,
  toFyersSymbol,
} from './symbols.js';
export type {
  Candle,
  FyersEnvelope,
  HistoryResponse,
  Instrument,
  InstrumentKind,
  RawCandle,
  RawLiteTick,
  Tick,
} from './types.js';
export {
  fyersEnvelopeSchema,
  historyResponseSchema,
  rawCandleSchema,
  rawLiteTickSchema,
  toCandle,
  toTick,
} from './types.js';
