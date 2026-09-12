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
  readonly rows: readonly AnnouncementDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly categories: readonly string[];
  readonly latestAt: string | null;
  readonly status: FreshnessStatus;
  readonly watchlistOnly: boolean;
  readonly hasWatchlists: boolean;
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
}

export interface InstitutionalFlowDto {
  /** Most recent sessions first. */
  readonly fiiDii: readonly FiiDiiDayDto[];
  /** The single latest session, for the headline cards. Null when none. */
  readonly latest: FiiDiiDayDto | null;
  readonly deals: readonly DealDto[];
  readonly shareholding: readonly ShareholdingDto[];
  readonly latestFlowDate: string | null;
  readonly status: FreshnessStatus;
  readonly watchlistOnly: boolean;
  readonly hasWatchlists: boolean;
  readonly disclaimer: string;
}
