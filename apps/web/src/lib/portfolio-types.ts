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
}

export interface PortfolioEntryDto {
  id: number;
  symbol: string;
  name: string;
  kind: 'opening' | 'add' | 'remove';
  tradeDate: string;
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
}

export interface HoldingDetailDto {
  holding: PortfolioHoldingDto;
  /** Every entry the user made for this stock, newest first. */
  entries: PortfolioEntryDto[];
  low52wPaise: number | null;
  high52wPaise: number | null;
  /** Share of the whole portfolio, 0..1. */
  portfolioWeight: number | null;
  pricesStale: boolean;
}

export interface EditEntryBody {
  tradeDate: string;
  shares: number;
  /** Total money for the entry in integer paise (cost with charges, or proceeds). */
  totalPaise: number;
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
