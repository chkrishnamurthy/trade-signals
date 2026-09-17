import type { AnnouncementInterpretation } from '@equitywise/core';
/**
 * Disclosure wire types — corporate announcements and institutional flow.
 *
 * Same contract as the rest of the wire layer: money is integer PAISE, instants
 * are ISO-8601 strings, trading dates are `YYYY-MM-DD` IST keys, and `null`
 * means "not available", never zero. These are official exchange facts, not
 * advice — nothing here is a recommendation or a prediction.
 */

/** How fresh the underlying data is. */
export type FreshnessStatus = 'fresh' | 'stale' | 'empty';

export interface AnnouncementDto {
  readonly interpretation: AnnouncementInterpretation | null;
  readonly interpretationChecksum: string | null;
  readonly externalId: string;
  readonly ingestedAt: string;
  readonly watchlistNames: readonly string[];
  readonly userState: {
    readonly read: boolean;
    readonly saved: boolean;
    readonly dismissed: boolean;
    readonly issueReported: boolean;
  };
  readonly id: number;
  readonly instrumentId: number | null;
  readonly symbol: string;
  readonly companyName: string;
  readonly category: string | null;
  readonly headline: string;
  readonly detail: string | null;
  readonly attachmentUrl: string | null;
  /** ISO-8601 UTC instant the exchange disseminated it. */
  readonly announcedAt: string;
  readonly source: string;
  /** Watchlists of the signed-in user that hold this name. */
  readonly onWatchlist: boolean;
}

export interface AnnouncementsPageDto {
  readonly coverage: {
    readonly latestAttempt: string | null;
    readonly lastSuccess: string | null;
    readonly failed: boolean;
    readonly stale: boolean;
  };
  readonly personalFilters: {
    readonly state: string;
    readonly eventStatus: string;
    readonly normalizedCategory: string;
    readonly source: string;
    readonly hasFacts: boolean;
  };
  readonly rows: readonly AnnouncementDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly categories: readonly string[];
  readonly latestAt: string | null;
  readonly status: FreshnessStatus;
  readonly watchlistOnly: boolean;
  readonly hasWatchlists: boolean;
  /** Server clock, so relative-day grouping renders identically on server and client. */
  readonly nowIso: string;
  /** The active filter state, echoed back so the UI reflects the URL. */
  readonly query: {
    readonly search: string | null;
    readonly symbol: string | null;
    readonly range: string;
    readonly highImpactOnly: boolean;
    readonly categories: readonly string[];
  };
  readonly disclaimer: string;
}

/** One session's FII and DII net activity, paise. */
export interface FiiDiiDayDto {
  readonly tradingDate: string;
  readonly fii: { readonly buy: number; readonly sell: number; readonly net: number } | null;
  readonly dii: { readonly buy: number; readonly sell: number; readonly net: number } | null;
}

export interface DealDto {
  readonly id: number;
  readonly dealType: 'bulk' | 'block';
  readonly tradingDate: string;
  readonly instrumentId: number | null;
  readonly symbol: string;
  readonly companyName: string;
  readonly clientName: string;
  readonly side: 'buy' | 'sell';
  readonly quantity: number;
  /** Weighted average price, paise. */
  readonly price: number;
  /** quantity × price, paise — the deal's rupee value. */
  readonly value: number;
  readonly exchange: string;
  readonly onWatchlist: boolean;
}

export interface ShareholdingDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly companyName: string;
  readonly asOfDate: string;
  readonly promoterPercent: number | null;
  readonly fiiPercent: number | null;
  readonly diiPercent: number | null;
  readonly publicPercent: number | null;
  /** Percentage-point change since the previous quarter on file; null without one. */
  readonly promoterChange: number | null;
  readonly fiiChange: number | null;
  readonly diiChange: number | null;
  readonly publicChange: number | null;
  readonly previousAsOfDate: string | null;
}

/** One quarter of a stock's ownership, for the drawer's trend. */
export interface ShareholdingQuarterDto {
  readonly asOfDate: string;
  readonly promoterPercent: number | null;
  readonly fiiPercent: number | null;
  readonly diiPercent: number | null;
  readonly publicPercent: number | null;
}

// ---------------------------------------------------------------------------
// Institutional flow — the page
// ---------------------------------------------------------------------------

/** Health of one feed, for the header chips. */
export type FeedStatus = 'fresh' | 'stale' | 'failed' | 'empty';

export interface FeedStatusDto {
  readonly id: string;
  readonly label: string;
  readonly status: FeedStatus;
  /** Newest session the feed has data for. */
  readonly asOf: string | null;
  /** When the worker last tried, ISO. */
  readonly lastAttemptAt: string | null;
  /** Why the last attempt failed, when it did. */
  readonly error: string | null;
}

/** A market-wide cash figure with its short and medium sums, paise. */
export interface CashFlowSummaryDto {
  readonly tradingDate: string;
  readonly net: number;
  readonly sum5: number;
  readonly sum20: number;
  /** Oldest → newest daily nets for the sparkline. */
  readonly series: readonly number[];
}

/** FII index-futures positioning from participant-wise OI, contracts. */
export interface IndexFuturesPositionDto {
  readonly tradingDate: string;
  readonly longContracts: number;
  readonly shortContracts: number;
  /** long − short. Positive is net long. */
  readonly net: number;
  /** vs the previous session on file. Null on the first. */
  readonly netChange: number | null;
  /** Long share of the participant's index-futures book, 0–100. */
  readonly longPercent: number;
  /** Oldest → newest nets for the sparkline. */
  readonly series: readonly number[];
}

/** One participant's long/short in one bucket for the latest session. */
export interface ParticipantOiCellDto {
  readonly participant: 'fii' | 'dii' | 'pro' | 'client';
  readonly bucket: 'index_fut' | 'stock_fut' | 'index_ce' | 'index_pe' | 'stock_ce' | 'stock_pe';
  readonly longContracts: number;
  readonly shortContracts: number;
  readonly netChange: number | null;
}

export interface MarketTapeDto {
  readonly fiiCash: CashFlowSummaryDto | null;
  readonly diiCash: CashFlowSummaryDto | null;
  readonly fiiIndexFutures: IndexFuturesPositionDto | null;
  /** Every participant × bucket for the latest session, for the positioning grid. */
  readonly participantOi: readonly ParticipantOiCellDto[];
  readonly participantOiDate: string | null;
  /** Newest first, up to 30 sessions. */
  readonly fiiDii: readonly FiiDiiDayDto[];
}

/** A stock's OI build-up label. Technical vocabulary about positioning, not a call. */
export type OiBuildupDto = 'long_buildup' | 'short_buildup' | 'short_covering' | 'long_unwinding';

export interface AttentionFactorDto {
  readonly id: 'delivery' | 'oi' | 'deals' | 'volume';
  readonly label: string;
  readonly reading: string;
  readonly contribution: number;
  readonly tone: 'positive' | 'negative' | 'neutral';
}

/** One row of the ranked stock table. Every figure names its own session. */
export interface StockFlowRowDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly companyName: string;
  readonly onWatchlist: boolean;
  readonly inFno: boolean;
  readonly delivery: {
    readonly tradingDate: string;
    readonly percent: number;
    readonly trailingPercent: number | null;
    readonly trailingSessions: number;
    /** Today − trailing mean, percentage points. */
    readonly delta: number | null;
  } | null;
  readonly price: {
    readonly tradingDate: string;
    readonly close: number;
    readonly change: number;
    readonly changePercent: number;
  } | null;
  readonly volume: {
    readonly tradedQty: number;
    /** Today ÷ trailing mean. */
    readonly ratio: number | null;
  } | null;
  readonly oi: {
    readonly tradingDate: string;
    readonly futuresOi: number;
    readonly changePercent: number | null;
    readonly buildup: OiBuildupDto | null;
  } | null;
  readonly deals: {
    readonly netPaise: number;
    readonly count: number;
    readonly latestDate: string;
  } | null;
  readonly attention: {
    readonly score: number;
    readonly factors: readonly AttentionFactorDto[];
  };
}

export interface InstitutionalFlowDto {
  readonly tape: MarketTapeDto;
  readonly stocks: readonly StockFlowRowDto[];
  /** The session the stock table's delivery figures describe. */
  readonly stocksAsOf: string | null;
  /** The session the OI column describes (a day behind delivery by design). */
  readonly oiAsOf: string | null;
  /** Recent deals, newest first. */
  readonly deals: readonly DealDto[];
  readonly shareholding: readonly ShareholdingDto[];
  readonly feeds: readonly FeedStatusDto[];
  readonly watchlistOnly: boolean;
  readonly hasWatchlists: boolean;
  readonly disclaimer: string;
}

/** The stock drawer: one name's history across every flow dataset. */
export interface StockFlowDetailDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly companyName: string;
  readonly onWatchlist: boolean;
  /** Oldest → newest. */
  readonly delivery: readonly {
    readonly tradingDate: string;
    readonly percent: number;
    readonly tradedQty: number;
    readonly close: number;
  }[];
  readonly deliveryAverage: number | null;
  /** Oldest → newest. */
  readonly oi: readonly {
    readonly tradingDate: string;
    readonly futuresOi: number;
    readonly close: number;
    readonly buildup: OiBuildupDto | null;
  }[];
  readonly deals: readonly DealDto[];
  /** Oldest → newest, up to 8 quarters. */
  readonly shareholding: readonly ShareholdingQuarterDto[];
  readonly disclaimer: string;
}
