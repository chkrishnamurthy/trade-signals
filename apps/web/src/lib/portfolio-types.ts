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
    valuePaise: number;
    costPaise: number;
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
  /** Stocks the user already has entries for that a holdings file would replace. */
  replaces: string[];
}

export interface AddEntryBody {
  symbol: string;
  kind: 'opening' | 'add' | 'remove';
  tradeDate: string;
  shares: number;
  pricePaise: number;
  chargesPaise: number;
}
