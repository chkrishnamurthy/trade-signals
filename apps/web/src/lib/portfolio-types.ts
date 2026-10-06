/**
 * What the portfolio page and its API exchange. Money is integer paise (rule 3);
 * ratios are plain fractions (0.2146 = +21.46%). PRIVATE data: never logged.
 */

export interface PortfolioHoldingDto {
  instrumentId: number;
  symbol: string;
  name: string;
  shares: number;
  /** Total cost of the shares still held. */
  costPaise: number;
  /** Cost ÷ shares, for display only. */
  avgCostPaise: number;
  ltpPaise: number | null;
  /** Where the price came from: the live-quote cache, or the last stored daily close. */
  priceSource: 'quote' | 'close' | null;
  /** When that price was taken, ISO. */
  priceAsOf: string | null;
  valuePaise: number | null;
  gainPaise: number | null;
  gainRatio: number | null;
  dayChangePaise: number | null;
  dayChangeRatio: number | null;
  /** Share of total value, 0..1. */
  weight: number | null;
  /** Splits and bonuses applied on read, so the share count can be explained. */
  adjustments: { kind: string; exDate: string; ratio: number }[];
  /**
   * Set when a purchase predates the corporate-action history on record: a split
   * or bonus before that date would not be reflected in the share count.
   */
  historyGapBefore: string | null;
}

export interface PortfolioEntryDto {
  id: number;
  symbol: string;
  name: string;
  kind: 'opening' | 'add' | 'remove';
  tradeDate: string;
  /** The real purchase date of an opening balance, when the user gave one. */
  acquiredOn: string | null;
  shares: number;
  amountPaise: number;
  source: 'manual' | 'file';
}

export interface PortfolioDto {
  holdings: PortfolioHoldingDto[];
  entries: PortfolioEntryDto[];
  entryCount: number;
  entryLimit: number;
  totals: {
    /** Value of the holdings that have a price. */
    valuePaise: number;
    /** What was paid for every holding, priced or not. */
    costPaise: number;
    /** What was paid for the priced holdings: value − this = gain. */
    pricedCostPaise: number;
    gainPaise: number;
    gainRatio: number | null;
    dayChangePaise: number;
    dayChangeRatio: number | null;
    unpriced: number;
  };
  /** When the newest price used was fetched, ISO, or null when none is available. */
  pricesAsOf: string | null;
  pricesStale: boolean;
  /** Entries that cannot be applied (for example a removal of shares never held). */
  problems: string[];
  /** Events in the next 60 days on stocks the user holds. */
  upcoming: UpcomingEventDto[];
  /** The headline return, for the overview tile. */
  returns: ReturnSummaryDto | null;
  /** True once any shares have been removed: FIFO and average cost can then differ. */
  hasRemovals: boolean;
}

export type ImportRowStatus = 'ready' | 'check' | 'skipped';

export interface ImportRowDto {
  line: number;
  /** The stock as written in the file. */
  fileSymbol: string;
  /** The NSE stock we matched it to, when we could. */
  symbol: string | null;
  name: string | null;
  kind: 'opening' | 'add' | 'remove';
  tradeDate: string;
  shares: number;
  amountPaise: number;
  status: ImportRowStatus;
  message: string;
}

export interface ImportPreviewDto {
  fileKind: 'holdings' | 'trades';
  rows: ImportRowDto[];
  counts: { ready: number; check: number; skipped: number };
  /** Stocks the user holds that a holdings file does not mention; they are left as they are. */
  notInFile: string[];
}

export interface AddEntryBody {
  symbol: string;
  kind: 'opening' | 'add' | 'remove';
  tradeDate: string;
  shares: number;
  pricePaise: number;
  chargesPaise: number;
  acquiredOn?: string | null;
}

export interface HoldingDetailDto {
  /** The stock, whether or not shares are still held. */
  stock: { symbol: string; name: string };
  /** The holding as it stands today; null for a stock whose shares were all removed. */
  holding: PortfolioHoldingDto | null;
  /** Every entry the user made for this stock, newest first. */
  entries: PortfolioEntryDto[];
  low52wPaise: number | null;
  high52wPaise: number | null;
  /** Share of the whole portfolio, 0..1. */
  portfolioWeight: number | null;
  pricesStale: boolean;
  /** Purchases still held, oldest first. */
  lots: LotDto[];
  /** Shares removed from this stock, matched to purchases oldest first. */
  realised: RealisedRowDto[];
  /** Each purchase with what was later removed from it and what is left. */
  purchases: PurchaseDto[];
  dividends: DividendRowDto[];
  /** This stock's own return: unrealised + realised + dividends. */
  totalReturnPaise: number | null;
}

export interface EditEntryBody {
  tradeDate: string;
  shares: number;
  /** Total money for the entry in integer paise (cost with charges, or proceeds). */
  totalPaise: number;
  acquiredOn?: string | null;
}

export interface UpcomingEventDto {
  symbol: string;
  name: string;
  eventType: string;
  eventDate: string;
  title: string;
  /** Dividend a share, paise, when the record has one. */
  dividendPaise: number | null;
  /** Shares held today; an estimate of the dividend uses it. */
  shares: number;
  /**
   * A bonus or split for the same stock on the calendar before this event. The
   * share count will change first, so no dividend estimate is given.
   */
  shareChangeBefore: { kind: string; date: string } | null;
}

export interface WeightGroupDto {
  key: string;
  label: string;
  valuePaise: number;
  weight: number;
  count: number;
}

export type CompanySizeKey = 'large' | 'mid' | 'small' | 'micro' | 'other';

export interface AnalysisHoldingDto {
  instrumentId: number;
  symbol: string;
  name: string;
  valuePaise: number;
  weight: number;
  dayChangeRatio: number | null;
  gainPaise: number | null;
  gainRatio: number | null;
  sector: string;
  /** The sector group this holding is drawn in ("Other sectors" when folded). */
  sectorGroup: string;
  size: CompanySizeKey;
}

export interface PortfolioAnalysisDto {
  totals: PortfolioDto['totals'];
  holdingCount: number;
  pricesAsOf: string | null;
  pricesStale: boolean;
  /** Priced holdings only: allocation needs a value. */
  holdings: AnalysisHoldingDto[];
  sectors: WeightGroupDto[];
  sizes: WeightGroupDto[];
  /** Where the size groups come from: AMFI's list (and its period) or index membership. */
  sizeBasis: {
    /** Period end of the AMFI list on file; null when none is loaded. */
    amfiPeriod: string | null;
    /** Priced holdings sized by index membership because AMFI's list does not have them. */
    indexCount: number;
  };
  concentration: {
    holdings: number;
    largest: number;
    top3: number;
    top5: number;
    effectiveHoldings: number;
    largestName: string;
  } | null;
  contributors: { symbol: string; name: string; gainPaise: number }[];
  /** How many holdings have a gain to show; the bars show at most a few of them. */
  contributorsTotal: number;
  /** Holdings left out of this page because they have no price yet. */
  unpriced: { count: number; costPaise: number };
  attention: string[];
  upcoming: UpcomingEventDto[];
}

// ---------------------------------------------------------------------------
// Phase 3: returns
// ---------------------------------------------------------------------------

export type ReturnStatusKey = 'ok' | 'too_short' | 'no_solution' | 'empty';

export interface ReturnSummaryDto {
  status: ReturnStatusKey;
  /** Yearly, money-weighted, as a fraction; only when status is 'ok'. */
  xirr: number | null;
  /** (value + money out + dividends − money in) ÷ money in. */
  simpleReturn: number | null;
  trackingSince: string | null;
  years: number;
  investedPaise: number;
  withdrawnPaise: number;
  dividendsPaise: number;
  valuePaise: number;
  gainPaise: number;
  /** Opening balances with no stored price on their date, counted at what was paid. */
  openingsAtCost: number;
}

export type TermKey = 'short' | 'long' | 'intraday';

export interface RealisedRowDto {
  symbol: string;
  name: string;
  acquiredOn: string;
  removedOn: string;
  shares: number;
  costPaise: number;
  proceedsPaise: number;
  gainPaise: number;
  daysHeld: number;
  term: TermKey;
  /** "2025-26". */
  financialYear: string;
}

export interface RealisedTotalsDto {
  shortTermPaise: number;
  longTermPaise: number;
  intradayPaise: number;
  totalPaise: number;
  count: number;
}

export interface DividendRowDto {
  symbol: string;
  name: string;
  exDate: string;
  perSharePaise: number | null;
  shares: number;
  amountPaise: number | null;
}

export interface PerHoldingReturnDto {
  symbol: string;
  name: string;
  held: boolean;
  /** Today's paper gain on shares still held; null when unpriced or none held. */
  unrealisedPaise: number | null;
  realisedPaise: number;
  dividendsPaise: number;
  totalPaise: number;
  /** Dividends in the last 12 months ÷ cost of shares held now. */
  yieldOnCost: number | null;
}

export interface ValuePointDto {
  date: string;
  valuePaise: number;
  netInvestedPaise: number;
  partial: boolean;
}

export interface PortfolioReturnsDto {
  summary: ReturnSummaryDto;
  realised: RealisedTotalsDto & { byYear: (RealisedTotalsDto & { year: string })[] };
  realisedRows: RealisedRowDto[];
  dividends: {
    totalPaise: number;
    unknownCount: number;
    byQuarter: { label: string; amountPaise: number }[];
    rows: DividendRowDto[];
  };
  series: ValuePointDto[];
  perHolding: PerHoldingReturnDto[];
  /** How far back splits, bonuses and dividends are on record; null when unknown. */
  historyFrom: string | null;
  /** Holdings with no price are counted at what was paid for them in today's value. */
  unpricedAtCost: number;
}

export interface LotDto {
  acquiredOn: string;
  trackedFrom: string;
  shares: number;
  costPaise: number;
  daysHeld: number;
  /** Days until the lot is long term (more than 12 months); 0 when it already is. */
  daysToLongTerm: number;
}

// ---------------------------------------------------------------------------
// Phase 4: benchmark and tax
// ---------------------------------------------------------------------------

export type PeriodKeyDto = '1M' | '3M' | '6M' | '1Y' | 'all';

export interface BenchmarkIndexDto {
  symbol: string;
  name: string;
  /** Same money, same dates, in this index; null when its closes are not loaded. */
  replay: {
    investedPaise: number;
    withdrawnPaise: number;
    valuePaise: number;
    simpleReturn: number | null;
    xirr: number | null;
    /** `no_history`: the index history loaded here starts after your first entry. */
    status: ReturnStatusKey | 'no_history';
    /** First date with an index close, as far as loaded. */
    indexFrom: string | null;
  } | null;
  periods: Record<PeriodKeyDto, number | null>;
}

export interface GrowthPointDto {
  date: string;
  yours: number;
  nifty50: number | null;
  nifty500: number | null;
}

export interface PortfolioBenchmarkDto {
  indices: BenchmarkIndexDto[];
  /** Your return without dividends, so it compares like for like with a price index. */
  yoursPriceOnly: { simpleReturn: number | null; xirr: number | null; status: ReturnStatusKey };
  /** Your first entry date. */
  from: string | null;
  /** Your time-weighted return over the same periods. */
  periods: Record<PeriodKeyDto, number | null>;
  growth: GrowthPointDto[];
  /** True when at least one index has closes loaded. */
  available: boolean;
}

export interface TaxRowDto {
  symbol: string;
  name: string;
  isin: string | null;
  acquiredOn: string;
  removedOn: string;
  shares: number;
  actualCostPaise: number;
  costUsedPaise: number;
  fmvPaise: number | null;
  proceedsPaise: number;
  gainPaise: number;
  daysHeld: number;
  term: TermKey;
  bonus: boolean;
  grandfathered: boolean;
  /** Acquired before Feb 2018 and long term, but no 31 Jan 2018 price was found: the 2018 rule is not applied. */
  fmvMissing: boolean;
}

export interface TaxYearDto {
  year: string;
  shortTermGainsPaise: number;
  shortTermLossesPaise: number;
  longTermGainsPaise: number;
  longTermLossesPaise: number;
  intradayPaise: number;
  /** Earlier years' losses available at the start of this year, and how much was used. */
  broughtForwardShortTermPaise: number;
  broughtForwardLongTermPaise: number;
  broughtForwardUsedPaise: number;
  netShortTermPaise: number;
  netLongTermPaise: number;
  exemptionPaise: number;
  exemptionUsedPaise: number;
  taxableShortTermPaise: number;
  taxableLongTermPaise: number;
  taxPaise: number;
  cessPaise: number;
  totalTaxPaise: number;
  shortTermLossCarriedPaise: number;
  longTermLossCarriedPaise: number;
  /** All losses still usable next year, by the year they arose in. */
  carryForward: { year: string; shortTermPaise: number; longTermPaise: number }[];
  dividendsPaise: number;
  rows: TaxRowDto[];
}

export interface PortfolioTaxDto {
  /** Financial years with a removal, newest first; the current year is always present. */
  years: string[];
  byYear: Record<string, TaxYearDto>;
  /** Whether 31 Jan 2018 prices are loaded (the 2018 rule needs them). */
  fmvLoaded: boolean;
  /** Every tax lot still held, valued today (bonus shares as their own lots). */
  openLots: OpenLotDto[];
  /** Unrealised gains of the lots still held, by today's term. */
  unrealised: {
    short: UnrealisedTermDto;
    long: UnrealisedTermDto;
    /** Lots without a price, left out of the totals. */
    unpriced: number;
  };
  /** Purchases still held that pass 12 months in the next 90 days. */
  turningLongTerm: {
    symbol: string;
    name: string;
    acquiredOn: string;
    shares: number;
    costPaise: number;
    daysToLongTerm: number;
  }[];
}

// ---------------------------------------------------------------------------
// Phase 5: risk
// ---------------------------------------------------------------------------

/** A figure, or how many sessions it still needs. */
export type RiskFigureDto<T> =
  | { status: 'ok'; value: T; sessions: number }
  | { status: 'needs_history'; sessions: number; needed: number };

export interface DeepestFallDto {
  /** Negative fraction: −0.131 is a fall of 13.1%. */
  depth: number;
  peakOn: string;
  troughOn: string;
  /** First day back at the old high; null while still below it. */
  recoveredOn: string | null;
}

export interface PortfolioRiskDto {
  /** Sessions with a daily return, all history. */
  sessions: number;
  /** Days left out because a price was stale. */
  skippedDays: number;
  /** Sessions a figure needs (about six months). */
  minSessions: number;
  volatility: { oneYear: RiskFigureDto<number>; all: RiskFigureDto<number> };
  deepestFall: RiskFigureDto<DeepestFallDto>;
  /** How far below its last high the portfolio stood (sampled weekly beyond a year). */
  drawdown: { date: string; drawdown: number }[];
  /** Against Nifty 50, over the last year. */
  beta: RiskFigureDto<{ beta: number; correlation: number | null }>;
  /** Largest holding first; figures over the last year. */
  stocks: {
    symbol: string;
    name: string;
    /** Share of today's value, 0 to 1. */
    weight: number;
    sessions: number;
    volatility: number | null;
    deepestFall: DeepestFallDto | null;
    /** Share of the portfolio's ups and downs; can be negative; null without enough history. */
    share: number | null;
  }[];
  /** Largest holdings (up to 15); cells[i][j] is null with too few shared sessions. */
  correlation: { symbols: string[]; cells: (number | null)[][] };
}

export interface UnrealisedTermDto {
  lots: number;
  valuePaise: number;
  costUsedPaise: number;
  gainPaise: number;
}

/** A tax lot still held (phase 6.1). */
export interface OpenLotDto {
  symbol: string;
  name: string;
  isin: string | null;
  acquiredOn: string;
  trackedFrom: string;
  shares: number;
  /** What was paid for these shares; zero for bonus shares. */
  costPaise: number;
  /** Total 31 Jan 2018 value, for shares acquired before February 2018 when known. */
  fmvPaise: number | null;
  valuePaise: number | null;
  /** Cost a gain would be worked out from today (the 2018 rule applied when long term). */
  costUsedPaise: number;
  gainPaise: number | null;
  daysHeld: number;
  term: 'short' | 'long';
  daysToLongTerm: number;
  bonus: boolean;
  grandfathered: boolean;
  fmvMissing: boolean;
}

/** One purchase of a stock and what became of it (phase 6.1). */
export interface PurchaseDto {
  acquiredOn: string;
  trackedFrom: string;
  /** Shares bought, on today's basis. */
  shares: number;
  costPaise: number;
  removed: {
    removedOn: string;
    shares: number;
    proceedsPaise: number;
    gainPaise: number;
    term: TermKey;
  }[];
  leftShares: number;
}

// ---------------------------------------------------------------------------
// Phase 6.2: notices about holdings
// ---------------------------------------------------------------------------

export type NoticeKindDto =
  | 'event_soon'
  | 'share_change'
  | 'stock_move'
  | 'portfolio_move'
  | 'long_term_soon';

export interface NoticeDto {
  id: number;
  kind: NoticeKindDto;
  /** The day the notice is about. */
  noticeDate: string;
  /** The facts (paise, dates, counts); the page words them. */
  data: Record<string, string | number | null>;
  createdAt: string;
  read: boolean;
}

export interface NoticeSettingsDto {
  events: boolean;
  shareChanges: boolean;
  stockMoves: boolean;
  /** Whole percent, 1–50. */
  stockMovePercent: number;
  portfolioMoves: boolean;
  portfolioMovePercent: number;
  longTerm: boolean;
  /** 1–90. */
  longTermDays: number;
}

export interface PortfolioNoticesDto {
  notices: NoticeDto[];
  unread: number;
  settings: NoticeSettingsDto;
}

// ---------------------------------------------------------------------------
// Phase 6.3: statement check (CAS)
// ---------------------------------------------------------------------------

export type StatementCheckStatus =
  | 'match'
  | 'different'
  | 'not_in_record'
  | 'not_in_statement'
  | 'unknown_stock';

export interface StatementCheckRowDto {
  isin: string | null;
  name: string;
  symbol: string | null;
  /** Shares the statement lists; null for a stock only in the record. */
  statementShares: number | null;
  /** Shares in the user's record on the statement's date; null when the stock is unknown. */
  recordShares: number | null;
  status: StatementCheckStatus;
  /** The statement line's numbers could not be cross-checked. */
  statementCheck: boolean;
}

export interface StatementCheckDto {
  /** The date the record was counted at. */
  asOf: string;
  /** The date printed on the statement, when it had one. */
  statementDate: string | null;
  rows: StatementCheckRowDto[];
  counts: Record<StatementCheckStatus, number>;
}
