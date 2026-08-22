/**
 * Wire types for the all-stocks list.
 *
 * Same contract as the rest of the wire layer: prices are integer PAISE, instants
 * are ISO-8601 strings, and `null` means "the exchange did not supply this".
 *
 * Two DTOs rather than one because the two halves cost wildly different amounts
 * upstream — quotes are two batched calls, indicators are one history call per
 * symbol. The table renders from the first and fills in from the second.
 */
import type { MoverDto, SectorDto, StockSignalDto } from './dashboard-types';
import type { MarketStateDto } from './market-types';

export interface StockRowDto extends MoverDto {
  /**
   * Index keys this symbol is a constituent of, e.g. `['nifty50', 'banknifty']`.
   *
   * A symbol in two indices is one row. Without this the six banks that sit in
   * both NIFTY 50 and BANK NIFTY would be indistinguishable from names that sit
   * in only one, and the index filter could not work.
   */
  readonly indices: readonly string[];
}

export interface StockIndexDto {
  readonly key: string;
  readonly name: string;
  readonly count: number;
}

export interface StocksDto {
  readonly rows: readonly StockRowDto[];
  /** Sector aggregates over `rows`, strongest first. Drives the filter strip. */
  readonly sectors: readonly SectorDto[];
  readonly indices: readonly StockIndexDto[];
  readonly market: MarketStateDto;
  readonly fetchedAt: string;
  /** Symbols the provider had no quote for. Shown, never silently dropped. */
  readonly missing: readonly string[];
  readonly refreshAfterSeconds: number;
}

export interface StockTechnicalsDto {
  readonly signals: readonly StockSignalDto[];
  readonly computedAt: string;
  /** Symbols whose daily history could not be fetched. */
  readonly skipped: readonly string[];
}
