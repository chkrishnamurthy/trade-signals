import type { MetricDto, ScreenerCellValue } from '@/lib/screener-types';

/**
 * The stock page's DTO (plan §6). Every section is independently nullable or
 * empty: one missing source never blanks the page. Prices are paise.
 */

export interface ChartBarDto {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

export interface LevelDto {
  readonly label: string;
  readonly paise: number;
  /** Shown as a badge when the close has crossed it this session. */
  readonly note: string | null;
}

export interface StockPageDto {
  readonly symbol: string;
  readonly name: string;
  readonly isin: string | null;
  readonly series: string | null;
  readonly industry: string | null;
  readonly indexLabels: readonly string[];
  readonly listingDate: string | null;
  /** The snapshot session the figures describe, or null if this stock has none. */
  readonly session: string | null;
  readonly stale: boolean;
  readonly values: Readonly<Record<string, ScreenerCellValue>> | null;
  readonly metrics: readonly MetricDto[];
  readonly bars: readonly ChartBarDto[];
  readonly ema20: readonly (number | null)[];
  readonly ema50: readonly (number | null)[];
  readonly corporateActions: readonly {
    exDate: string;
    kind: string;
    ratio: string;
    note: string | null;
  }[];
  readonly delivery: readonly { date: string; pct: number; qty: number }[];
  readonly deals: readonly {
    date: string;
    type: string;
    client: string;
    side: string;
    quantity: number;
    price: number;
  }[];
  readonly oi: readonly {
    date: string;
    oi: number;
    change: number | null;
    buildup: string | null;
    futuresClose: number;
  }[];
  readonly shareholding: readonly {
    asOf: string;
    promoter: number | null;
    public: number | null;
  }[];
  readonly announcements: readonly {
    id: number;
    at: string;
    headline: string;
    category: string | null;
    url: string | null;
  }[];
  readonly events: readonly { date: string; type: string; title: string }[];
  readonly peers: readonly {
    symbol: string;
    name: string;
    close: number;
    changePct: number | null;
    ret3m: number | null;
    rsRank: number | null;
  }[];
  readonly levels: readonly LevelDto[];
  readonly match: {
    readonly screenName: string | null;
    readonly reasons: readonly string[];
    readonly matched: boolean;
  } | null;
  /** Admin-only: the latest signal with its full factor breakdown (hard rule 8). */
  readonly signal: {
    readonly date: string;
    readonly direction: string;
    readonly strength: number;
    readonly factors: readonly {
      label: string;
      score: number;
      weight: number;
      detail: string | null;
    }[];
  } | null;
}
