import { z } from 'zod';
import { isoInstant, paise, paiseOrNull } from './common.js';

/**
 * Watchlist contracts. Quote fields come from the live provider snapshot;
 * indicator fields from the worker's end-of-day pass (`indicatorDate` says which
 * CLOSED session). Signals are read from stored rows, never recomputed here.
 */

export const signalDirectionSchema = z.enum([
  'strong_bullish',
  'bullish',
  'neutral',
  'bearish',
  'strong_bearish',
]);
export type SignalDirection = z.infer<typeof signalDirectionSchema>;

export const rowSignalSchema = z.object({
  direction: signalDirectionSchema,
  /** 0-100, 50 neutral; explained by the stored factor breakdown on the web. */
  strength: z.number(),
  setups: z.array(z.string()),
  tradingDate: z.string(),
});

export const watchlistRowSchema = z.object({
  instrumentId: z.number().int(),
  symbol: z.string(),
  name: z.string(),
  exchange: z.string(),
  sector: z.string().nullable(),
  note: z.string().nullable(),
  addedAt: isoInstant,

  ltp: paiseOrNull,
  change: paiseOrNull,
  changePercent: z.number().nullable(),
  open: paiseOrNull,
  dayHigh: paiseOrNull,
  dayLow: paiseOrNull,
  previousClose: paiseOrNull,
  averagePrice: paiseOrNull,
  volume: z.number().nullable(),
  quoteAt: isoInstant.nullable(),

  indicatorDate: z.string().nullable(),
  rsi14: z.number().nullable(),
  ema20: paiseOrNull,
  ema50: paiseOrNull,
  ema200: paiseOrNull,
  sma20: paiseOrNull,
  sma50: paiseOrNull,
  macdHistogram: z.number().nullable(),
  atr14: paiseOrNull,
  high52w: paiseOrNull,
  low52w: paiseOrNull,
  averageVolume: z.number().nullable(),
  relativeVolume: z.number().nullable(),
  previousVolume: z.number().nullable(),

  /** Adjusted closes (paise) at each return window's anchor, keyed by window id. */
  returnCloses: z.record(paise),
  signal: rowSignalSchema.nullable(),
});
export type WatchlistRow = z.infer<typeof watchlistRowSchema>;

export const watchlistSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  position: z.number(),
  isDefault: z.boolean(),
  count: z.number().int(),
  updatedAt: isoInstant,
});
export type WatchlistSummary = z.infer<typeof watchlistSummarySchema>;

/** GET /api/watchlists */
export const watchlistsResponseSchema = z.object({ watchlists: z.array(watchlistSummarySchema) });

/** POST /api/watchlists */
export const createWatchlistResponseSchema = z.object({ watchlist: watchlistSummarySchema });

/** GET /api/watchlists/:id — layout/views are web-table concerns; kept opaque here. */
export const watchlistDetailSchema = z.object({
  watchlist: watchlistSummarySchema,
  rows: z.array(watchlistRowSchema),
  market: z.object({ isOpen: z.boolean(), phase: z.string() }),
  fetchedAt: isoInstant,
  missingQuotes: z.array(z.string()),
  /** True when no quotes could be fetched: price columns must read as stale. */
  quotesStale: z.boolean(),
  /** Poll on the server's terms. */
  refreshAfterSeconds: z.number(),
});
export type WatchlistDetail = z.infer<typeof watchlistDetailSchema>;

/** POST /api/watchlists/:id/items */
export const addSymbolsResponseSchema = z.object({
  added: z.array(z.string()),
  duplicates: z.array(z.string()),
  unknown: z.array(z.string()),
});
export type AddSymbolsResult = z.infer<typeof addSymbolsResponseSchema>;

/** DELETE /api/watchlists/:id/items */
export const removeSymbolsResponseSchema = z.object({ removed: z.number() });

/** GET /api/watchlists/templates */
export const watchlistTemplateSchema = z.object({
  id: z.string(),
  kind: z.enum(['index', 'sector']),
  name: z.string(),
  description: z.string(),
  symbols: z.array(z.string()),
});
export type WatchlistTemplate = z.infer<typeof watchlistTemplateSchema>;
export const watchlistTemplatesResponseSchema = z.object({
  templates: z.array(watchlistTemplateSchema),
});

/** Trailing-return windows, in display order (mirrors the web registry). */
export const RETURN_WINDOW_LABELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'return1w', label: '1W' },
  { id: 'return1m', label: '1M' },
  { id: 'return3m', label: '3M' },
  { id: 'return6m', label: '6M' },
  { id: 'returnYtd', label: 'YTD' },
  { id: 'return1y', label: '1Y' },
  { id: 'return3y', label: '3Y' },
  { id: 'return5y', label: '5Y' },
];

/** POST /api/watchlists/from-template */
export const fromTemplateResponseSchema = z.object({
  watchlist: watchlistSummarySchema,
  added: z.number(),
  unknown: z.array(z.string()),
});
