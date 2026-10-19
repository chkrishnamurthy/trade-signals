import { parseCount, scaledRupeesToPaise } from './units.js';

/**
 * The issue-size sentence, read into its parts.
 *
 * Exchanges publish issue size as one sentence that mixes units, e.g.
 *   "fresh issue aggregating up to 14500 lakhs and offer for sale up to
 *    15,00,000 Equity Shares"
 * Each component is an amount (paise) OR a share count, whichever the text
 * states; the other stays null. Nothing is converted between the two here —
 * pricing shares needs the band and is a DERIVED value (`issueSizePaise`).
 *
 * Partial reads are normal. The verbatim sentence is always stored and shown
 * when a component is missing, so a phrasing this does not understand costs
 * completeness, never correctness.
 */

export interface IssueQuantity {
  readonly paise: number | null;
  readonly shares: number | null;
}

export interface ParsedIssueSize {
  readonly fresh: IssueQuantity | null;
  readonly offerForSale: IssueQuantity | null;
  /** The whole issue, when the sentence states only a total. */
  readonly total: IssueQuantity | null;
  readonly marketMakerShares: number | null;
  readonly anchorShares: number | null;
  readonly employeeReservation: IssueQuantity | null;
}

const EMPTY: ParsedIssueSize = {
  fresh: null,
  offerForSale: null,
  total: null,
  marketMakerShares: null,
  anchorShares: null,
  employeeReservation: null,
};

/**
 * `Rs. 35,500 Lakhs`, `14500 lakhs`, `₹1,250 crore`, `Rs. 3,200 million`,
 * `15,00,000 Equity Shares`, `42,67,200 fresh equity shares`. Group 1
 * currency, 2 number, 3 scale word, 4 a "shares" word (possibly after "fresh").
 */
const QUANTITY =
  /(rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\b|millions?|mn\b|billions?|bn\b)?\s*((?:fresh\s+)?(?:equity\s+)?shares?)?/gi;

/** Each scale word, divided by 100 (the count goes through hundredths). */
const COUNT_SCALE: readonly [RegExp, number][] = [
  [/^la/i, 1_000],
  [/^cr/i, 100_000],
  [/^(million|mn)/i, 10_000],
  [/^(billion|bn)/i, 10_000_000],
];

/** `1.2` lakh shares → 120000, in integer arithmetic (via hundredths). */
function scaledCount(number: string, scale: string): number | null {
  const hundredths = scaledRupeesToPaise(number, null);
  if (hundredths === null) return null;
  const factor = COUNT_SCALE.find(([word]) => word.test(scale))?.[1];
  if (factor === undefined) return null;
  const count = hundredths * factor;
  return Number.isSafeInteger(count) ? count : null;
}

function quantitiesIn(text: string): IssueQuantity[] {
  const out: IssueQuantity[] = [];
  for (const match of text.matchAll(QUANTITY)) {
    const [, currency, number = '', scale, sharesWord] = match;
    if (sharesWord !== undefined && currency === undefined) {
      // "15,00,000 equity shares" or "1.2 lakh equity shares" — a count either way.
      const shares = scale === undefined ? parseCount(number) : scaledCount(number, scale);
      if (shares !== null && shares > 0) out.push({ paise: null, shares });
    } else if (scale !== undefined || currency !== undefined) {
      const paise = scaledRupeesToPaise(number, scale ?? null);
      if (paise !== null && paise > 0) out.push({ paise, shares: null });
    }
  }
  return out;
}

/** The first quantity in `text` after `keyword`, or immediately before it. */
function quantityNear(text: string, keyword: RegExp): IssueQuantity | null {
  const at = keyword.exec(text);
  if (at === null) return null;
  const after = quantitiesIn(text.slice(at.index + at[0].length))[0];
  if (after !== undefined) return after;
  // "42,67,200 fresh equity shares": the number precedes the keyword.
  const before = quantitiesIn(text.slice(Math.max(0, at.index - 40), at.index + at[0].length + 20));
  return before[0] ?? null;
}

/** Splits off parenthetical clauses ("(Including market maker portion …)"). */
function splitParentheticals(text: string): { main: string; asides: string[] } {
  const asides: string[] = [];
  const main = text.replace(/\(([^()]*)\)/g, (_, inner: string) => {
    asides.push(inner);
    return ' ';
  });
  return { main, asides };
}

export function parseIssueSize(text: string | null | undefined): ParsedIssueSize {
  if (text === null || text === undefined) return EMPTY;
  const normalised = text.replace(/^["\s]+|["\s]+$/g, '').replace(/\s+/g, ' ');
  if (normalised === '') return EMPTY;
  const { main, asides } = splitParentheticals(normalised);

  // The main clause: "fresh … and offer for sale …". Each part is read only
  // from its own segment so the OFS amount can never be taken for the fresh one.
  const ofsAt = /offer\s+for\s+sale|\bofs\b/i.exec(main);
  const freshSegment = ofsAt === null ? main : main.slice(0, ofsAt.index);
  const ofsSegment = ofsAt === null ? null : main.slice(ofsAt.index);

  const fresh = /fresh/i.test(freshSegment)
    ? quantityNear(freshSegment, /fresh(?:\s+issue)?/i)
    : null;
  const offerForSale =
    ofsSegment === null ? null : quantityNear(ofsSegment, /offer\s+for\s+sale|\bofs\b/i);
  const total =
    fresh === null && offerForSale === null ? (quantitiesIn(freshSegment)[0] ?? null) : null;

  let marketMakerShares: number | null = null;
  let anchorShares: number | null = null;
  let employeeReservation: IssueQuantity | null = null;
  // Asides can also live in the main clause when the source omits brackets.
  for (const aside of [...asides, main]) {
    for (const clause of aside.split(/\band\b|,(?!\d)/i)) {
      if (/market\s*maker/i.test(clause) && marketMakerShares === null)
        marketMakerShares = quantitiesIn(clause).find((q) => q.shares !== null)?.shares ?? null;
      if (/anchor/i.test(clause) && anchorShares === null)
        anchorShares = quantitiesIn(clause).find((q) => q.shares !== null)?.shares ?? null;
      if (/employee/i.test(clause) && employeeReservation === null)
        employeeReservation = quantitiesIn(clause)[0] ?? null;
    }
  }

  return { fresh, offerForSale, total, marketMakerShares, anchorShares, employeeReservation };
}
