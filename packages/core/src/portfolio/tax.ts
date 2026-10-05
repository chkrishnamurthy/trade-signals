import {
  daysHeldBetween,
  orderEntries,
  type PortfolioEntry,
  type ShareChange,
  type Term,
  termOf,
} from './derive.js';
import { financialYear } from './returns.js';

/**
 * Indicative capital-gains figures for Indian listed shares, from the user's own
 * entries. Not tax advice: no surcharge, no losses brought forward from earlier
 * years, no other income. Every rule here is named in the tax view.
 *
 * Tax lots differ from the returns lots in one place: a bonus creates new
 * zero-cost shares acquired on the ex-date (Income-tax Act s.55(2)(aa)), so they
 * have their own holding period. Splits and consolidations only restate shares.
 *
 * Grandfathering (s.112A): for shares acquired before 1 Feb 2018 and sold as long
 * term, the cost used is the higher of the actual cost and the lower of the fair
 * market value on 31 Jan 2018 (that day's highest price) and the sale value.
 */

export const GRANDFATHERING_CUTOFF = '2018-02-01';
/** New rates apply to transfers on or after this date (Finance (No. 2) Act 2024). */
export const RATE_CHANGE_DATE = '2024-07-23';

export interface TaxRealisation {
  readonly instrumentId: number;
  readonly acquiredOn: string;
  readonly removedOn: string;
  readonly shares: number;
  /** What was actually paid for these shares (zero for bonus shares). */
  readonly actualCostPaise: number;
  /** Cost the gain is worked out from (after grandfathering). */
  readonly costUsedPaise: number;
  readonly proceedsPaise: number;
  readonly gainPaise: number;
  readonly daysHeld: number;
  readonly term: Term;
  readonly intraday: boolean;
  readonly bonus: boolean;
  /** Present when the 2018 rule was considered: total fair market value of the shares sold. */
  readonly fmvPaise: number | null;
  readonly grandfathered: boolean;
  readonly financialYear: string;
}

interface TaxLot {
  acquiredOn: string;
  trackedFrom: string;
  shares: number;
  costPaise: number;
  /** Total 31 Jan 2018 value of the shares in the lot, when the rule can apply. */
  fmvPaise: number | null;
  bonus: boolean;
}

const SHARE_CHANGING = new Set(['split', 'bonus', 'consolidation']);

type Event =
  | { readonly at: string; readonly order: 0; readonly change: ShareChange }
  | { readonly at: string; readonly order: 1; readonly entry: PortfolioEntry };

/**
 * Removals matched to tax lots, oldest acquisition first, with the 2018 rule
 * applied. `fmv2018` maps an instrument to its 31 Jan 2018 high a share (paise).
 */
export function taxRealisations(
  entries: readonly PortfolioEntry[],
  changes: readonly ShareChange[],
  fmv2018: ReadonlyMap<number, number>,
): TaxRealisation[] {
  const out: TaxRealisation[] = [];
  const instruments = [...new Set(entries.map((e) => e.instrumentId))];
  for (const instrumentId of instruments) {
    const mine = changes.filter(
      (c) => c.instrumentId === instrumentId && SHARE_CHANGING.has(c.kind) && c.ratio > 0,
    );
    const fmvShare = fmv2018.get(instrumentId) ?? null;
    const events: Event[] = [
      ...mine.map((change) => ({ at: change.exDate, order: 0 as const, change })),
      ...orderEntries(entries.filter((e) => e.instrumentId === instrumentId)).map((entry) => ({
        at: entry.tradeDate,
        order: 1 as const,
        entry,
      })),
    ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order));

    const lots: TaxLot[] = [];
    // Restate shares entered on a later basis back to 31 Jan 2018's, for the fair
    // market value of an opening balance acquired before 2018.
    const sharesOn2018 = (shares: number, enteredOn: string) => {
      let s = shares;
      for (const c of mine) if (c.exDate > '2018-01-31' && c.exDate <= enteredOn) s *= c.ratio;
      return s;
    };

    for (const ev of events) {
      if (ev.order === 0) {
        const { change } = ev;
        const before = [...lots];
        for (const lot of before) {
          if (lot.acquiredOn >= change.exDate && lot.trackedFrom >= change.exDate) continue;
          const restated = Math.floor(lot.shares / change.ratio + 1e-9);
          if (change.kind === 'bonus') {
            const extra = restated - lot.shares;
            if (extra > 0)
              lots.push({
                acquiredOn: change.exDate,
                trackedFrom: change.exDate,
                shares: extra,
                costPaise: 0,
                fmvPaise: null,
                bonus: true,
              });
          } else {
            lot.shares = restated;
          }
        }
        lots.sort((a, b) =>
          a.acquiredOn < b.acquiredOn ? -1 : a.acquiredOn > b.acquiredOn ? 1 : 0,
        );
        continue;
      }
      const e = ev.entry;
      if (e.kind !== 'remove') {
        const acquiredOn = e.acquiredOn ?? e.tradeDate;
        const fmv =
          fmvShare !== null && acquiredOn < GRANDFATHERING_CUTOFF
            ? Math.round(sharesOn2018(e.shares, e.tradeDate) * fmvShare)
            : null;
        lots.push({
          acquiredOn,
          trackedFrom: e.tradeDate,
          shares: e.shares,
          costPaise: e.amountPaise,
          fmvPaise: fmv,
          bonus: false,
        });
        lots.sort((a, b) =>
          a.acquiredOn < b.acquiredOn ? -1 : a.acquiredOn > b.acquiredOn ? 1 : 0,
        );
        continue;
      }
      let left = e.shares;
      let proceedsLeft = e.amountPaise;
      for (const lot of lots) {
        if (left === 0) break;
        if (lot.shares === 0) continue;
        const take = Math.min(left, lot.shares);
        const costOut =
          take === lot.shares ? lot.costPaise : Math.round((lot.costPaise * take) / lot.shares);
        const fmvOut =
          lot.fmvPaise === null
            ? null
            : take === lot.shares
              ? lot.fmvPaise
              : Math.round((lot.fmvPaise * take) / lot.shares);
        const proceeds =
          take === left ? proceedsLeft : Math.round((e.amountPaise * take) / e.shares);
        lot.shares -= take;
        lot.costPaise -= costOut;
        if (lot.fmvPaise !== null && fmvOut !== null) lot.fmvPaise -= fmvOut;
        left -= take;
        proceedsLeft -= proceeds;
        const term = termOf(lot.acquiredOn, e.tradeDate);
        const ruleApplies = fmvOut !== null && term === 'long';
        const costUsed = ruleApplies ? Math.max(costOut, Math.min(fmvOut, proceeds)) : costOut;
        out.push({
          instrumentId,
          acquiredOn: lot.acquiredOn,
          removedOn: e.tradeDate,
          shares: take,
          actualCostPaise: costOut,
          costUsedPaise: costUsed,
          proceedsPaise: proceeds,
          gainPaise: proceeds - costUsed,
          daysHeld: daysHeldBetween(lot.acquiredOn, e.tradeDate),
          term,
          intraday: lot.trackedFrom === e.tradeDate && lot.acquiredOn === e.tradeDate,
          bonus: lot.bonus,
          fmvPaise: ruleApplies ? fmvOut : null,
          grandfathered: ruleApplies && costUsed !== costOut,
          financialYear: financialYear(e.tradeDate),
        });
      }
      // Shares beyond what the lots hold are left for the returns engine to report.
      for (let i = lots.length - 1; i >= 0; i--) if (lots[i]?.shares === 0) lots.splice(i, 1);
    }
  }
  return out.sort((a, b) =>
    a.removedOn < b.removedOn
      ? -1
      : a.removedOn > b.removedOn
        ? 1
        : a.instrumentId - b.instrumentId,
  );
}

export interface TaxRates {
  readonly shortTerm: number;
  readonly longTerm: number;
}

/** Rates by transfer date: 15% / 10% before 23 Jul 2024, 20% / 12.5% from then. */
export function ratesOn(removedOn: string): TaxRates {
  return removedOn < RATE_CHANGE_DATE
    ? { shortTerm: 0.15, longTerm: 0.1 }
    : { shortTerm: 0.2, longTerm: 0.125 };
}

/** Long-term exemption for a financial year: ₹1 lakh until FY 2023-24, ₹1.25 lakh from FY 2024-25. */
export function longTermExemptionPaise(year: string): number {
  return Number(year.slice(0, 4)) >= 2024 ? 12_500_000 : 10_000_000;
}

export const CESS = 0.04;

export interface TaxYearSummary {
  readonly year: string;
  readonly shortTermGainsPaise: number;
  readonly shortTermLossesPaise: number;
  readonly longTermGainsPaise: number;
  readonly longTermLossesPaise: number;
  readonly intradayPaise: number;
  /** Gains left after this year's losses are set off. */
  readonly netShortTermPaise: number;
  readonly netLongTermPaise: number;
  readonly exemptionPaise: number;
  readonly exemptionUsedPaise: number;
  readonly taxableShortTermPaise: number;
  readonly taxableLongTermPaise: number;
  readonly taxPaise: number;
  readonly cessPaise: number;
  readonly totalTaxPaise: number;
  /** Losses this year could not use; they carry forward only if the return is filed on time. */
  readonly shortTermLossCarriedPaise: number;
  readonly longTermLossCarriedPaise: number;
  readonly count: number;
}

interface Bucket {
  old: number;
  current: number;
}
const take = (bucket: Bucket, amount: number): number => {
  // Use the higher-taxed (current-rate) part first: the reading most favourable to the user.
  let left = amount;
  const fromCurrent = Math.min(bucket.current, left);
  bucket.current -= fromCurrent;
  left -= fromCurrent;
  const fromOld = Math.min(bucket.old, left);
  bucket.old -= fromOld;
  left -= fromOld;
  return amount - left;
};

/**
 * One financial year's capital gains with this year's set-off: a short-term
 * loss can reduce short- and then long-term gains; a long-term loss only
 * long-term gains. Then the long-term exemption, then the rates by sale date,
 * then 4% cess. Intraday is shown apart and not taxed here.
 */
export function summariseTaxYear(
  realisations: readonly TaxRealisation[],
  year: string,
): TaxYearSummary {
  const rows = realisations.filter((r) => r.financialYear === year);
  const st: Bucket = { old: 0, current: 0 };
  const lt: Bucket = { old: 0, current: 0 };
  let stLoss = 0;
  let ltLoss = 0;
  let intraday = 0;
  for (const r of rows) {
    if (r.intraday) {
      intraday += r.gainPaise;
      continue;
    }
    const current = r.removedOn >= RATE_CHANGE_DATE;
    if (r.term === 'short') {
      if (r.gainPaise >= 0) st[current ? 'current' : 'old'] += r.gainPaise;
      else stLoss += -r.gainPaise;
    } else if (r.gainPaise >= 0) lt[current ? 'current' : 'old'] += r.gainPaise;
    else ltLoss += -r.gainPaise;
  }
  const stGains = st.old + st.current;
  const ltGains = lt.old + lt.current;

  // Set-off within the year.
  const stUsedOnSt = take(st, stLoss);
  const stUsedOnLt = take(lt, stLoss - stUsedOnSt);
  const ltUsed = take(lt, ltLoss);
  const exemption = longTermExemptionPaise(year);
  const exemptionUsed = take(lt, exemption);

  const old = ratesOn('2024-07-22');
  const now = ratesOn(RATE_CHANGE_DATE);
  const tax = Math.round(
    st.old * old.shortTerm +
      st.current * now.shortTerm +
      lt.old * old.longTerm +
      lt.current * now.longTerm,
  );
  const cess = Math.round(tax * CESS);
  return {
    year,
    shortTermGainsPaise: stGains,
    shortTermLossesPaise: stLoss,
    longTermGainsPaise: ltGains,
    longTermLossesPaise: ltLoss,
    intradayPaise: intraday,
    netShortTermPaise: stGains - stUsedOnSt,
    netLongTermPaise: ltGains - stUsedOnLt - ltUsed,
    exemptionPaise: exemption,
    exemptionUsedPaise: exemptionUsed,
    taxableShortTermPaise: st.old + st.current,
    taxableLongTermPaise: lt.old + lt.current,
    taxPaise: tax,
    cessPaise: cess,
    totalTaxPaise: tax + cess,
    shortTermLossCarriedPaise: stLoss - stUsedOnSt - stUsedOnLt,
    longTermLossCarriedPaise: ltLoss - ltUsed,
    count: rows.length,
  };
}

/** Financial years with any removal, newest first. */
export function taxYears(realisations: readonly TaxRealisation[]): string[] {
  return [...new Set(realisations.map((r) => r.financialYear))].sort().reverse();
}
