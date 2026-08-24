/**
 * Global market ticker wire types.
 *
 * A deliberately small projection of the dashboard snapshot. The ticker renders
 * on EVERY page, so it must not ship fifty constituent quotes, sector rollups
 * and mover lists to a user who is looking at their watchlist — but it must
 * also not cost a second round of upstream calls. It does neither: the route
 * reads the same server-side dashboard cache and returns only these fields.
 *
 * Prices remain integer PAISE (CLAUDE.md hard rule 3); instants are ISO-8601.
 */
import type { HeadlineIndexDto, SentimentDto } from './dashboard-types';
import type { MarketStateDto } from './market-types';

/**
 * A headline index as the ticker needs it.
 *
 * `sparkline` is dropped — there is no room for a chart in a 48px bar, and it
 * is the only large field on the source shape.
 */
export type TickerIndexDto = Omit<HeadlineIndexDto, 'sparkline'>;

/**
 * The sentiment label only, never the score.
 *
 * CLAUDE.md forbids rendering a confidence number the factors cannot explain,
 * and the header has no room for the drivers. The label is a summary, the
 * drivers live on Market overview, and the tooltip says so.
 */
export interface TickerSentimentDto {
  readonly label: SentimentDto['label'];
}

export interface MarketTickerDto {
  readonly indices: readonly TickerIndexDto[];
  readonly market: MarketStateDto;
  readonly sentiment: TickerSentimentDto;
  readonly fetchedAt: string;
  readonly cached: boolean;
  readonly refreshAfterSeconds: number;
}
