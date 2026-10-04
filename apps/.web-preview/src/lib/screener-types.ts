import type { FilterNode, MetricCategory, MetricOption, MetricUnit } from '@equitywise/core';

/**
 * Screener DTOs — the JSON contract between `server/screener.ts` and the
 * client. Values keep their STORED units (prices in paise); formatting
 * happens in components.
 */

export type ScreenerCellValue = number | boolean | string | readonly string[] | null;

export interface ScreenerRowDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly values: Readonly<Record<string, ScreenerCellValue>>;
  /** Last 60 adjusted closes, paise, oldest first. */
  readonly spark: readonly number[] | null;
  readonly dataIssue: string | null;
}

export interface ScreenResultDto {
  readonly tradingDate: string | null;
  readonly builtAt: string | null;
  /** True when the newest snapshot is older than a normal weekend gap. */
  readonly stale: boolean;
  readonly total: number;
  readonly base: number;
  readonly limit: number;
  readonly offset: number;
  readonly rows: readonly ScreenerRowDto[];
}

export interface ConditionCountsDto {
  readonly base: number;
  readonly labels: readonly string[];
  readonly individual: readonly number[];
  readonly cumulative: readonly number[];
}

export interface MetricDto {
  readonly key: string;
  readonly label: string;
  readonly category: MetricCategory;
  readonly unit: MetricUnit;
  readonly description: string;
  readonly decimals: number | null;
  readonly options: readonly MetricOption[] | null;
}

export interface PresetDto {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly description: string;
  readonly filter: FilterNode;
  readonly sort: string;
}

export interface SavedScreenDto {
  readonly id: number;
  readonly name: string;
  readonly filter: FilterNode;
  readonly columns: readonly string[];
  readonly sort: string;
  readonly universe: string;
  readonly updatedAt: string;
}

export interface ScreenerMetaDto {
  readonly isAdmin: boolean;
  readonly metrics: readonly MetricDto[];
  readonly categories: readonly { readonly key: MetricCategory; readonly label: string }[];
  readonly presets: readonly PresetDto[];
  readonly industries: readonly string[];
  readonly sessions: readonly string[];
  readonly latest: { readonly tradingDate: string; readonly builtAt: string | null } | null;
  readonly watchlists: readonly { readonly id: number; readonly name: string }[];
  readonly indices: readonly MetricOption[];
  readonly defaultColumns: readonly string[];
}

/** Columns shown before the user picks any. */
export const DEFAULT_COLUMNS = [
  'close',
  'changePct',
  'ret1m',
  'rsRank',
  'relVolume',
  'deliveryPct',
  'rsi14',
  'closeVsEma200',
  'oiBuildup',
  'promoterChgQoq',
] as const;
