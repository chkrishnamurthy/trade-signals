import { z } from 'zod';
import { isoInstant, paise, paiseOrNull } from './common.js';

/** Exchange session phase. `open` is continuous trading and nothing else. */
export const marketPhaseSchema = z.enum([
  'pre_open',
  'open',
  'closed',
  'post_close',
  'closing_auction',
  'unknown',
]);
export type MarketPhase = z.infer<typeof marketPhaseSchema>;

export const marketStateSchema = z.object({
  isOpen: z.boolean(),
  phase: z.string(),
});

/** One index card (GET /api/market/indices). Levels are in paise by convention. */
export const indexSnapshotSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string(),
  display: z.enum(['index', 'volatility']),
  ltp: paise,
  change: paiseOrNull,
  changePercent: z.number().nullable(),
  open: paiseOrNull,
  high: paiseOrNull,
  low: paiseOrNull,
  previousClose: paiseOrNull,
  at: isoInstant.nullable(),
});
export type IndexSnapshot = z.infer<typeof indexSnapshotSchema>;

export const indexStripSchema = z.object({
  indices: z.array(indexSnapshotSchema),
  market: marketStateSchema,
  asOf: isoInstant,
  stale: z.object({ reason: z.string() }).optional(),
});
export type IndexStrip = z.infer<typeof indexStripSchema>;

/** GET /api/search?q= */
export const searchHitSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  kind: z.string(),
  exchange: z.string(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;
export const searchResponseSchema = z.object({ results: z.array(searchHitSchema) });

/** Chart timeframes accepted by GET /api/history/:symbol?tf= */
export const HISTORY_TIMEFRAMES = ['1D', '5D', '1M', '3M', '6M', '1Y', '5Y'] as const;
export type HistoryTimeframe = (typeof HISTORY_TIMEFRAMES)[number];

export const historyBarSchema = z.object({
  /** Bar open instant (ISO string or epoch ms, as the provider layer emits). */
  t: z.union([isoInstant, z.number()]),
  o: paise,
  h: paise,
  l: paise,
  c: paise,
  v: z.number().nullable(),
});
export type HistoryBar = z.infer<typeof historyBarSchema>;

export const historyResponseSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  timeframe: z.string(),
  resolution: z.string(),
  session: z.object({ open: z.number(), close: z.number() }).optional(),
  bars: z.array(historyBarSchema),
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

/** GET /api/stocks/:symbol — end-of-day picture for the stock screen. */
export const stockDetailSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  kind: z.enum(['equity', 'index']),
  exchange: z.string(),
  isin: z.string().nullable(),
  sector: z.string(),
  tradingDate: z.string().nullable(),
  close: paise,
  changePercent: z.number().nullable(),
  high: paise,
  low: paise,
  volume: z.number(),
  high52w: paiseOrNull,
  low52w: paiseOrNull,
  ema20: paiseOrNull,
  ema50: paiseOrNull,
  ema200: paiseOrNull,
  sma20: paiseOrNull,
  sma50: paiseOrNull,
  rsi14: z.number().nullable(),
  macdHistogram: z.number().nullable(),
  atr14: paiseOrNull,
  averageVolume: z.number().nullable(),
  relativeVolume: z.number().nullable(),
  corporateActions: z.array(
    z.object({
      kind: z.string(),
      exDate: z.string(),
      ratio: z.string(),
      note: z.string().nullable(),
    }),
  ),
  peers: z.array(z.object({ symbol: z.string(), name: z.string(), sector: z.string() })),
});
export type StockDetail = z.infer<typeof stockDetailSchema>;
export const stockDetailResponseSchema = z.object({ stock: stockDetailSchema });
