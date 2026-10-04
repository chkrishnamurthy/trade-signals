import type {
  FactBasis,
  IpoBoard,
  IpoClosedStage,
  IpoDocumentKind,
  IpoExchange,
  IpoIssueMethod,
  IpoStatus,
  IpoSubscriptionCategory,
  SubscriptionScope,
} from '@equitywise/shared';
import type { IpoListSort, IpoListSummaryDto } from './ipo-list';

/**
 * IPO wire types (docs/planning/ipos-plan.md §9).
 *
 * Same contract as the rest of the wire layer: money is integer PAISE,
 * instants are ISO-8601 strings, calendar days are `YYYY-MM-DD` IST keys, and
 * `null` means "not available" — never zero. These are exchange facts and an
 * explicitly UNOFFICIAL grey-market quote; nothing here is a recommendation.
 */

export interface PriceBandDto {
  readonly lowPaise: number;
  readonly highPaise: number;
}

export interface FactSourceDto {
  readonly source: string;
  /** Human name of the source, e.g. "NSE". */
  readonly sourceName: string;
  readonly url: string;
  readonly observedAt: string;
  readonly basis: FactBasis;
}

export interface SubscriptionSummaryDto {
  readonly scope: SubscriptionScope;
  readonly asOf: string;
  readonly totalTimes: number | null;
  readonly retailTimes: number | null;
}

/**
 * The compact GMP for cards and tables. `official: false` is a literal so a
 * component cannot accept it without knowing what it is.
 */
export interface GmpChipDto {
  readonly official: false;
  readonly latestPaise: number | null;
  readonly percentOfUpperBand: number | null;
  readonly observedAt: string;
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly stale: boolean;
}

export interface ListingSummaryDto {
  readonly exchange: IpoExchange;
  readonly listingDate: string;
  readonly issuePricePaise: number;
  readonly listingOpenPaise: number;
  readonly listingGainPercent: number | null;
  readonly listingClosePaise: number;
  readonly listingDayChangePercent: number | null;
  readonly latestClosePaise: number | null;
  readonly latestCloseDate: string | null;
  readonly sinceIssuePercent: number | null;
}

export interface IpoListItemDto {
  readonly slug: string;
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly status: IpoStatus;
  readonly closedStage: IpoClosedStage | null;
  readonly exchanges: readonly IpoExchange[];
  readonly nseSymbol: string | null;
  readonly openDate: string | null;
  readonly closeDate: string | null;
  /** Official listing date, once the exchange has published it. */
  readonly listingDate: string | null;
  /** T+3 listing date, while the official one is unknown. */
  readonly expectedListingDate: string | null;
  readonly upiCutoffAt: string | null;
  readonly priceBand: PriceBandDto | null;
  readonly issuePricePaise: number | null;
  readonly lotSize: number | null;
  /**
   * Lots in an individual's smallest application: 1 on the mainboard, 2 on
   * SME since SEBI's March 2025 rule (see `minApplicationLots` in core).
   */
  readonly minApplicationLots: number;
  /** Minimum order quantity (or `minApplicationLots` lots) × the upper band. */
  readonly minInvestmentPaise: number | null;
  readonly issueSizePaise: number | null;
  readonly issueSizeBasis: 'official' | 'derived_at_upper_band' | null;
  readonly subscription: SubscriptionSummaryDto | null;
  readonly gmp: GmpChipDto | null;
  readonly listing: ListingSummaryDto | null;
}

export type IpoFeedState = 'fresh' | 'stale' | 'failed' | 'empty';

export interface IpoFeedStatusDto {
  readonly id: string;
  readonly label: string;
  readonly status: IpoFeedState;
  readonly lastSuccessAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly error: string | null;
}

export type AgendaEventKind =
  | 'opens'
  | 'closes'
  | 'allotment'
  | 'refunds'
  | 'demat_credit'
  | 'listing';

export interface IpoAgendaEventDto {
  readonly slug: string;
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly kind: AgendaEventKind;
  /** Computed from the T+3 rule, not stated by a source. */
  readonly expected: boolean;
}

export interface IpoAgendaDayDto {
  readonly date: string;
  readonly events: readonly IpoAgendaEventDto[];
}

export interface GmpPolicyDto {
  /** Whether a GMP source is configured and enabled at all. */
  readonly enabled: boolean;
  readonly sourceName: string | null;
  readonly sourceUrl: string | null;
  /** The IST day GMP coverage begins (the first stored quote); null before any. */
  readonly trackedSince: string | null;
}

/**
 * A DRHP (or an addendum to one) filed with SEBI — regulator data. A filing
 * is not an announced issue; `slug` is set only when exactly one issue on the
 * exchange has the same name.
 */
export interface SebiFilingDto {
  readonly sebiId: string;
  readonly companyName: string;
  /** As SEBI names the document (`DRHP`, `Addendum to DRHP`…); null when it names none. */
  readonly documentLabel: string | null;
  readonly filedDate: string;
  readonly pageUrl: string;
  readonly abridgedUrl: string | null;
  readonly slug: string | null;
}

export interface IposPageDto {
  readonly today: string;
  readonly filters: {
    readonly status: IpoStatus | null;
    readonly board: IpoBoard | null;
    readonly exchange: IpoExchange | null;
    readonly q: string;
  };
  readonly counts: Readonly<Record<IpoStatus, number>>;
  readonly highlights: {
    readonly openNow: readonly IpoListItemDto[];
    readonly opensThisWeek: number;
    readonly closesToday: number;
    readonly listsThisWeek: number;
  };
  readonly agenda: readonly IpoAgendaDayDto[];
  readonly rows: readonly IpoListItemDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly feeds: readonly IpoFeedStatusDto[];
  readonly gmpPolicy: GmpPolicyDto;
  /** Which exchanges' issues the page covers, in words. */
  readonly coverageNote: string;
  /** The latest DRHPs filed with SEBI; empty when the source is off. */
  readonly filings: readonly SebiFilingDto[];
  readonly disclaimer: string;
  readonly gmpNote: string;
}

/** Board-and-year listing outcomes, from the exchanges' end-of-day prices. */
export interface IpoYearStatsDto {
  readonly year: number;
  /** Issues with an official listing date this year, up to today. */
  readonly listed: number;
  readonly withListingPrice: number;
  readonly openedAboveIssue: number;
  readonly withLatestClose: number;
  readonly latestAboveIssue: number;
}

/** A closed issue's allotment, and where an applicant checks it. */
export interface IpoAllotmentRowDto {
  readonly slug: string;
  readonly companyName: string;
  readonly allotmentDate: string | null;
  /** Computed from the T+3 rule, not stated by a source. */
  readonly allotmentExpected: boolean;
  readonly listingDate: string | null;
  readonly listingExpected: boolean;
  readonly registrarName: string | null;
  /** The registrar's own allotment page, from `ipo-registrars.yaml`. */
  readonly registrarUrl: string | null;
}

/** An offer document of an open or upcoming issue, linked where the exchange hosts it. */
export interface IpoDocumentLinkDto {
  readonly slug: string;
  readonly companyName: string;
  readonly kind: IpoDocumentKind;
  readonly url: string;
  readonly host: string;
  /** RHP sections quoted on the issue page from this document. */
  readonly sectionsQuoted: number;
}

/** How the last GMP before listing compared with listings — the honest context. */
export interface GmpTrackSummaryDto {
  readonly official: false;
  readonly months: number;
  /** Where GMP coverage begins, when that is inside the window. */
  readonly since: string | null;
  readonly tolerancePoints: number;
  readonly total: number;
  readonly within: number;
}

/**
 * The IPO dashboard (`/ipos`): one board's current issues in compact modules.
 * Every list is already ordered and trimmed by the server.
 */
export interface IpoDashboardDto {
  readonly board: IpoBoard;
  readonly today: string;
  /** When the official issue calendar was last read; null before the first read. */
  readonly asOf: string | null;
  readonly feeds: readonly IpoFeedStatusDto[];
  /** This board's issues by status, all years. */
  readonly counts: Readonly<Record<IpoStatus, number>>;
  /** Closed issues still on their way to listing (not "no listing reported"). */
  readonly awaitingListing: number;
  readonly yearStats: IpoYearStatsDto;
  /** Open, upcoming, awaiting listing, then listed in the last week. */
  readonly current: readonly IpoListItemDto[];
  /** Issues with bids: open first, then recently closed. */
  readonly subscription: readonly IpoListItemDto[];
  /** Unlisted issues with a GMP quote, highest premium first. */
  readonly gmp: readonly IpoListItemDto[];
  /** Recent listings with prices, newest first. */
  readonly listings: readonly IpoListItemDto[];
  /** The next five settlement days. */
  readonly agenda: readonly IpoAgendaDayDto[];
  readonly allotment: readonly IpoAllotmentRowDto[];
  readonly documents: readonly IpoDocumentLinkDto[];
  /** DRHPs filed with SEBI (mainboard only; SME drafts are filed with the exchange). */
  readonly filings: readonly SebiFilingDto[];
  readonly exchangeAllotment: readonly { readonly label: string; readonly url: string }[];
  readonly gmpPolicy: GmpPolicyDto;
  readonly gmpTrack: GmpTrackSummaryDto | null;
  readonly coverageNote: string;
  readonly disclaimer: string;
  readonly gmpNote: string;
}

/** One board's full list (`/ipos/mainboard`, `/ipos/sme`). */
export interface IpoListPageDto {
  readonly board: IpoBoard;
  readonly today: string;
  readonly filters: {
    readonly status: IpoStatus | null;
    /** Null = every year. */
    readonly year: number | null;
    readonly q: string;
  };
  /** Years with issues on this board, newest first. */
  readonly years: readonly number[];
  /** By status, under the board, year and search filters. */
  readonly counts: Readonly<Record<IpoStatus, number>>;
  /** The tiles above the list, under the same filters as `counts`. */
  readonly summary: IpoListSummaryDto;
  readonly sort: IpoListSort;
  readonly rows: readonly IpoListItemDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly feeds: readonly IpoFeedStatusDto[];
  readonly gmpPolicy: GmpPolicyDto;
  readonly coverageNote: string;
  readonly disclaimer: string;
  readonly gmpNote: string;
}

export interface IpoCalendarDto {
  readonly from: string;
  readonly to: string;
  readonly days: readonly IpoAgendaDayDto[];
}

export interface SubscriptionRowDto {
  readonly category: IpoSubscriptionCategory;
  readonly label: string;
  readonly sharesOffered: number | null;
  readonly sharesBid: number | null;
  readonly times: number | null;
}

export interface SubscriptionTableDto {
  readonly source: string;
  readonly scope: SubscriptionScope;
  readonly asOf: string;
  readonly asOfBasis: 'stated' | 'fetched';
  readonly rows: readonly SubscriptionRowDto[];
}

export interface SubscriptionPointDto {
  readonly asOf: string;
  readonly totalTimes: number | null;
  readonly retailTimes: number | null;
  readonly qibTimes: number | null;
  readonly niiTimes: number | null;
}

export interface TimelineEventDto {
  readonly kind: AgendaEventKind;
  readonly date: string;
  readonly expected: boolean;
  readonly done: boolean;
}

export interface IpoDocumentDto {
  readonly kind: IpoDocumentKind;
  readonly title: string;
  readonly url: string;
  readonly host: string;
}

export interface GmpPointDto {
  readonly observedAt: string;
  readonly gmpPaise: number | null;
  readonly percentOfUpperBand: number | null;
}

export type GmpPanelDto =
  | {
      readonly official: false;
      readonly available: true;
      readonly sourceName: string;
      readonly sourceUrl: string;
      readonly latestPaise: number | null;
      readonly percentOfUpperBand: number | null;
      readonly rangeLowPaise: number | null;
      readonly rangeHighPaise: number | null;
      readonly observedAt: string;
      readonly stale: boolean;
      readonly history: readonly GmpPointDto[];
    }
  | {
      readonly official: false;
      readonly available: false;
      readonly reason: 'no_quote' | 'source_disabled' | 'not_tracked' | 'before_tracking';
      readonly sourceName: string | null;
    };

export interface GmpTrackRowDto {
  readonly slug: string;
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly listingDate: string;
  readonly lastGmpPercent: number;
  readonly listingGainPercent: number;
  readonly differencePoints: number;
  readonly outcome: 'within' | 'gmp_above' | 'gmp_below';
}

export interface GmpTrackRecordDto {
  readonly official: false;
  readonly months: number;
  /** The board compared; null when every board is mixed in. */
  readonly board: IpoBoard | null;
  /** Where GMP coverage begins, when that is inside the window — the record is shorter. */
  readonly since: string | null;
  readonly tolerancePoints: number;
  readonly total: number;
  readonly within: number;
  readonly gmpAbove: number;
  readonly gmpBelow: number;
  readonly rows: readonly GmpTrackRowDto[];
  /** This issue's own comparison, on a detail page. */
  readonly thisIssue: GmpTrackRowDto | null;
}

export interface RegistrarDto {
  readonly name: string;
  readonly contact: string | null;
  readonly allotmentUrl: string | null;
  /** The date the link last answered from a plain request; null = unconfirmed. */
  readonly allotmentChecked: string | null;
}

export interface SourceUsedDto {
  readonly source: string;
  readonly sourceName: string;
  readonly feed: string;
  readonly url: string;
  readonly lastSeenAt: string;
}

export interface IssueSizeDto {
  readonly text: string | null;
  readonly totalPaise: number | null;
  readonly basis: 'official' | 'derived_at_upper_band' | null;
  readonly freshPaise: number | null;
  readonly freshShares: number | null;
  readonly offerForSalePaise: number | null;
  readonly offerForSaleShares: number | null;
  readonly marketMakerShares: number | null;
  readonly anchorShares: number | null;
}

/**
 * An RHP section extracted with page citations (Phase 11). Everything is
 * QUOTED from the document — text, list items and figures alike. Figures stay
 * the document's own strings ("33,867.73" in the stated unit), never numbers.
 */
export interface RhpExtractDto {
  readonly section: 'overview' | 'promoters' | 'objects' | 'strengths' | 'risks' | 'financials';
  readonly title: string;
  /** A quoted passage (the overview). */
  readonly text: string | null;
  /** Quoted list items (objects, promoters, strengths, risk headings). */
  readonly items: readonly string[];
  /** Quoted figures (the restated financial summary). */
  readonly table: {
    readonly unit: string;
    readonly columns: readonly string[];
    readonly rows: readonly {
      readonly label: string;
      readonly values: readonly (string | null)[];
    }[];
  } | null;
  /** 1-based PDF pages — what a PDF viewer shows, not the printed folio. */
  readonly pageFrom: number;
  readonly pageTo: number;
  readonly documentUrl: string;
  readonly extractedAt: string;
}

/** One category's smallest or largest application, in whole lots at the upper band. */
export interface InvestmentLimitDto {
  readonly kind: 'individual' | 'retail_min' | 'retail_max' | 'snii_min' | 'snii_max' | 'bnii_min';
  readonly lots: number;
  readonly shares: number;
  readonly amountPaise: number;
}

export interface IpoDetailDto extends IpoListItemDto {
  readonly isin: string | null;
  readonly bseScripCode: string | null;
  readonly designatedExchange: IpoExchange | null;
  readonly issueMethod: IpoIssueMethod | null;
  readonly faceValuePaise: number | null;
  readonly minBidQuantity: number | null;
  readonly retailMaxPaise: number | null;
  readonly maxRetailLots: number | null;
  /**
   * Computed from the lot, the upper band and SEBI's category limits — the
   * mainboard's retail/NII split, or SME's fixed individual lots and NII.
   */
  readonly investmentLimits: readonly InvestmentLimitDto[];
  readonly employeeDiscountPaise: number | null;
  readonly sharesOffered: number | null;
  readonly issueSize: IssueSizeDto;
  readonly registrar: RegistrarDto | null;
  readonly exchangeAllotment: readonly { readonly label: string; readonly url: string }[];
  readonly leadManagers: readonly string[];
  readonly sponsorBanks: readonly string[];
  readonly marketMaker: string | null;
  readonly timeline: readonly TimelineEventDto[];
  readonly subscriptionTable: SubscriptionTableDto | null;
  readonly subscriptionNseOnly: SubscriptionTableDto | null;
  readonly subscriptionHistory: readonly SubscriptionPointDto[];
  readonly documents: readonly IpoDocumentDto[];
  readonly rhp: readonly RhpExtractDto[];
  /** Issues opening on or after this day have their offer document quoted; older ones are linked. */
  readonly rhpReadFrom: string | null;
  /** This issue's DRHP and addenda as filed with SEBI, oldest first. */
  readonly filings: readonly SebiFilingDto[];
  readonly gmpPanel: GmpPanelDto;
  readonly gmpTrackRecord: GmpTrackRecordDto;
  readonly sources: readonly SourceUsedDto[];
  readonly fieldSources: Readonly<Record<string, FactSourceDto>>;
  readonly updatedAt: string;
  readonly disclaimer: string;
  readonly gmpNote: string;
}

export interface IpoAdminHealthDto {
  readonly feeds: readonly IpoFeedStatusDto[];
  readonly unmatched: readonly {
    readonly source: string;
    readonly feed: string;
    readonly externalKey: string;
    readonly companyName: string | null;
    readonly lastSeenAt: string;
    readonly sourceUrl: string;
  }[];
  readonly conflicts: readonly {
    readonly slug: string;
    readonly companyName: string;
    readonly fields: readonly string[];
  }[];
  /** RHP documents by extraction state (Phase 11). */
  readonly rhp: {
    readonly extracted: number;
    readonly pending: number;
    readonly failed: number;
    readonly lastError: string | null;
  };
}
