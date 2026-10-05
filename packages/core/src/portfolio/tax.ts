import {
  daysHeldBetween,
  orderEntries,
  type PortfolioEntry,
  type ShareChange,
  sameDayFirst,
  type Term,
  termOf,
} from './derive.js';
import { financialYear } from './returns.js';

/**
 * Indicative capital-gains figures for Indian listed shares, from the user's own
 * entries. Not tax advice: no surcharge, no other income, and losses brought
 * forward only from the years recorded here. Every rule here is named in the tax view.
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
  /** Acquired before 1 Feb 2018 and disposed of as long term, but no 31 Jan 2018 price was found. */
  readonly fmvMissing: boolean;
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
const LAST_DAY_BEFORE_CUTOFF = '2018-01-31';

type Event =
  | { readonly at: string; readonly order: 0; readonly change: ShareChange }
  | { readonly at: string; readonly order: 1; readonly entry: PortfolioEntry }
  /** End of 31 Jan 2018: every lot acquired by then takes that day's value. */
  | { readonly at: string; readonly order: 2 };

const byAcquired = (a: TaxLot, b: TaxLot) =>
  a.acquiredOn < b.acquiredOn ? -1 : a.acquiredOn > b.acquiredOn ? 1 : 0;

/** Restates a count across one split, bonus or consolidation (ratio is the price multiplier). */
const restate = (shares: number, ratio: number) => Math.floor(shares / ratio + 1e-9);

/**
 * An entry whose shares were acquired before it was entered (an opening balance
 * with an "Acquired on" date) already includes any bonus shares allotted in
 * between. Those are rebuilt as their own zero-cost lots dated the ex-date, and
 * the original purchase is restated back to its own count, so each part has the
 * right holding period. Without such changes it is one lot.
 */
function piecesOf(
  entry: PortfolioEntry,
  changes: readonly ShareChange[],
): { acquiredOn: string; shares: number; costPaise: number; bonus: boolean }[] {
  const acquiredOn = entry.acquiredOn ?? entry.tradeDate;
  const single = [{ acquiredOn, shares: entry.shares, costPaise: entry.amountPaise, bonus: false }];
  const between = changes.filter((c) => c.exDate > acquiredOn && c.exDate <= entry.tradeDate);
  if (!between.some((c) => c.kind === 'bonus')) return single;
  // Back to the count first acquired…
  let original = entry.shares;
  for (const c of [...between].reverse()) original = Math.round(original * c.ratio);
  if (original <= 0) return single;
  // …then forward again, each bonus adding a new zero-cost lot.
  const pieces = [{ acquiredOn, shares: original, costPaise: entry.amountPaise, bonus: false }];
  for (const c of between) {
    if (c.kind === 'bonus') {
      const held = pieces.reduce((a, p) => a + p.shares, 0);
      const extra = restate(held, c.ratio) - held;
      if (extra > 0)
        pieces.push({ acquiredOn: c.exDate, shares: extra, costPaise: 0, bonus: true });
    } else {
      for (const p of pieces) p.shares = restate(p.shares, c.ratio);
    }
  }
  // Rounding lands on the original purchase so the pieces add up to the entry.
  const first = pieces[0];
  const total = pieces.reduce((a, p) => a + p.shares, 0);
  if (first === undefined || first.shares + entry.shares - total <= 0) return single;
  first.shares += entry.shares - total;
  return pieces;
}

/**
 * Removals matched to tax lots (same-day additions first, then the oldest
 * acquisition), with the 2018 rule applied. `fmv2018` maps an instrument to
 * its 31 Jan 2018 high a share (paise). A removal of more shares than were
 * held is left out, as the returns view leaves it out.
 */
export function taxRealisations(
  entries: readonly PortfolioEntry[],
  changes: readonly ShareChange[],
  fmv2018: ReadonlyMap<number, number>,
): TaxRealisation[] {
  const out: TaxRealisation[] = [];
  const instruments = [...new Set(entries.map((e) => e.instrumentId))];
  for (const instrumentId of instruments) {
    const mine = changes
      .filter((c) => c.instrumentId === instrumentId && SHARE_CHANGING.has(c.kind) && c.ratio > 0)
      .sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));
    const fmvShare = fmv2018.get(instrumentId) ?? null;
    const events: Event[] = [
      ...mine.map((change) => ({ at: change.exDate, order: 0 as const, change })),
      ...orderEntries(entries.filter((e) => e.instrumentId === instrumentId)).map((entry) => ({
        at: entry.tradeDate,
        order: 1 as const,
        entry,
      })),
      { at: LAST_DAY_BEFORE_CUTOFF, order: 2 as const },
    ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order));

    const lots: TaxLot[] = [];
    // A count entered after 31 Jan 2018, restated to that day's basis. Bonuses
    // are their own lots, so only splits and consolidations restate it.
    const sharesOn2018 = (shares: number, enteredOn: string) => {
      let s = shares;
      for (const c of mine)
        if (c.kind !== 'bonus' && c.exDate > LAST_DAY_BEFORE_CUTOFF && c.exDate <= enteredOn)
          s *= c.ratio;
      return s;
    };

    for (const ev of events) {
      if (ev.order === 2) {
        if (fmvShare === null) continue;
        for (const lot of lots)
          if (lot.acquiredOn < GRANDFATHERING_CUTOFF && lot.shares > 0)
            lot.fmvPaise = lot.shares * fmvShare;
        continue;
      }
      if (ev.order === 0) {
        const { change } = ev;
        for (const lot of [...lots]) {
          const restated = restate(lot.shares, change.ratio);
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
        lots.sort(byAcquired);
        continue;
      }
      const e = ev.entry;
      if (e.kind !== 'remove') {
        const afterCutoff = e.tradeDate > LAST_DAY_BEFORE_CUTOFF;
        for (const piece of piecesOf(e, mine)) {
          lots.push({
            ...piece,
            trackedFrom: e.tradeDate,
            // Entered after 31 Jan 2018 for shares acquired before it: that day's
            // value from the count restated back. Earlier entries get it on the day.
            fmvPaise:
              fmvShare !== null && afterCutoff && piece.acquiredOn < GRANDFATHERING_CUTOFF
                ? Math.round(sharesOn2018(piece.shares, e.tradeDate) * fmvShare)
                : null,
          });
        }
        lots.sort(byAcquired);
        continue;
      }
      const held = lots.reduce((a, l) => a + l.shares, 0);
      if (e.shares > held) continue;
      let left = e.shares;
      let proceedsLeft = e.amountPaise;
      for (const lot of sameDayFirst(lots, e.tradeDate)) {
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
          fmvMissing: term === 'long' && lot.acquiredOn < GRANDFATHERING_CUTOFF && fmvOut === null,
          financialYear: financialYear(e.tradeDate),
        });
      }
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

/** A loss not yet used, by the financial year it arose in. */
export interface LossCarried {
  readonly year: string;
  readonly shortTermPaise: number;
  readonly longTermPaise: number;
}

/** A capital loss may be carried forward for eight years after the year it arose in. */
export const LOSS_CARRY_YEARS = 8;

const startYear = (year: string) => Number(year.slice(0, 4));

export interface TaxYearSummary {
  readonly year: string;
  readonly shortTermGainsPaise: number;
  readonly shortTermLossesPaise: number;
  readonly longTermGainsPaise: number;
  readonly longTermLossesPaise: number;
  readonly intradayPaise: number;
  /** Earlier years' losses available at the start of the year. */
  readonly broughtForwardShortTermPaise: number;
  readonly broughtForwardLongTermPaise: number;
  /** How much of them this year's gains used. */
  readonly broughtForwardUsedPaise: number;
  /** Gains left after this year's losses and earlier years' losses are set off. */
  readonly netShortTermPaise: number;
  readonly netLongTermPaise: number;
  readonly exemptionPaise: number;
  readonly exemptionUsedPaise: number;
  readonly taxableShortTermPaise: number;
  readonly taxableLongTermPaise: number;
  readonly taxPaise: number;
  readonly cessPaise: number;
  readonly totalTaxPaise: number;
  /** This year's losses that this year could not use. */
  readonly shortTermLossCarriedPaise: number;
  readonly longTermLossCarriedPaise: number;
  /** Every loss still usable next year (this year's and earlier ones not yet expired). */
  readonly carryForward: readonly LossCarried[];
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
 * One financial year's capital gains. Set-off is required, not optional:
 *   1. this year's losses: a short-term loss reduces short- and then long-term
 *      gains; a long-term loss only long-term gains;
 *   2. earlier years' losses (`broughtForward`, oldest first, at most eight years
 *      old) in the same way, even when the gain is within the exemption;
 *   3. the long-term exemption, then the rates by sale date, then 4% cess.
 * Intraday is shown apart and neither taxed nor carried here.
 */
export function summariseTaxYear(
  realisations: readonly TaxRealisation[],
  year: string,
  broughtForward: readonly LossCarried[] = [],
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

  // 1. This year's losses.
  const stUsedOnSt = take(st, stLoss);
  const stUsedOnLt = take(lt, stLoss - stUsedOnSt);
  const ltUsed = take(lt, ltLoss);

  // 2. Earlier years' losses still in date, oldest first. A long-term loss can
  // only meet long-term gains, so it goes first and leaves short-term losses free.
  const usable = broughtForward
    .filter((l) => {
      const age = startYear(year) - startYear(l.year);
      return age >= 1 && age <= LOSS_CARRY_YEARS;
    })
    .sort((a, b) => (a.year < b.year ? -1 : 1))
    .map((l) => ({ ...l }));
  const bfShort = usable.reduce((a, l) => a + l.shortTermPaise, 0);
  const bfLong = usable.reduce((a, l) => a + l.longTermPaise, 0);
  let bfUsed = 0;
  for (const l of usable) {
    const used = take(lt, l.longTermPaise);
    l.longTermPaise -= used;
    bfUsed += used;
  }
  for (const l of usable) {
    const onSt = take(st, l.shortTermPaise);
    const onLt = take(lt, l.shortTermPaise - onSt);
    l.shortTermPaise -= onSt + onLt;
    bfUsed += onSt + onLt;
  }

  // 3. Exemption, rates and cess.
  const netShort = st.old + st.current;
  const netLong = lt.old + lt.current;
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
  const stCarried = stLoss - stUsedOnSt - stUsedOnLt;
  const ltCarried = ltLoss - ltUsed;
  const nextYear = startYear(year) + 1;
  const carryForward: LossCarried[] = [
    ...usable.filter(
      (l) =>
        (l.shortTermPaise > 0 || l.longTermPaise > 0) &&
        nextYear - startYear(l.year) <= LOSS_CARRY_YEARS,
    ),
    ...(stCarried > 0 || ltCarried > 0
      ? [{ year, shortTermPaise: stCarried, longTermPaise: ltCarried }]
      : []),
  ];
  return {
    year,
    shortTermGainsPaise: stGains,
    shortTermLossesPaise: stLoss,
    longTermGainsPaise: ltGains,
    longTermLossesPaise: ltLoss,
    intradayPaise: intraday,
    broughtForwardShortTermPaise: bfShort,
    broughtForwardLongTermPaise: bfLong,
    broughtForwardUsedPaise: bfUsed,
    netShortTermPaise: netShort,
    netLongTermPaise: netLong,
    exemptionPaise: exemption,
    exemptionUsedPaise: exemptionUsed,
    taxableShortTermPaise: st.old + st.current,
    taxableLongTermPaise: lt.old + lt.current,
    taxPaise: tax,
    cessPaise: cess,
    totalTaxPaise: tax + cess,
    shortTermLossCarriedPaise: stCarried,
    longTermLossCarriedPaise: ltCarried,
    carryForward,
    count: rows.length,
  };
}

const fyLabel = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;

/**
 * Every financial year from the first one with a removal to `through`, each
 * with the losses carried in from the years before it. Assumes each year's
 * return was filed on time, which carrying a loss forward requires.
 */
export function summariseTaxYears(
  realisations: readonly TaxRealisation[],
  through: string,
): Map<string, TaxYearSummary> {
  const out = new Map<string, TaxYearSummary>();
  const first = taxYears(realisations).at(-1);
  if (first === undefined) return out;
  let carried: readonly LossCarried[] = [];
  for (let y = startYear(first); y <= startYear(through); y++) {
    const summary = summariseTaxYear(realisations, fyLabel(y), carried);
    out.set(summary.year, summary);
    carried = summary.carryForward;
  }
  return out;
}

/** Financial years with any removal, newest first. */
export function taxYears(realisations: readonly TaxRealisation[]): string[] {
  return [...new Set(realisations.map((r) => r.financialYear))].sort().reverse();
}
