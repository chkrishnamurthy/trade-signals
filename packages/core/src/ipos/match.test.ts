import { describe, expect, it } from 'vitest';
import {
  type IssueIdentity,
  matchFiling,
  matchGmpRow,
  matchIssue,
  matchListing,
  nameTokens,
  normalisedName,
} from './match.js';

const issue = (
  over: Partial<IssueIdentity> & { id: number; companyName: string },
): IssueIdentity => ({
  board: 'mainboard',
  isin: null,
  nseSymbol: null,
  bseScripCode: null,
  openDate: null,
  closeDate: null,
  ...over,
});

describe('name normalisation', () => {
  it('drops legal forms, keeps distinguishing words', () => {
    expect(nameTokens('Vishal Nirmiti Limited')).toEqual(['vishal', 'nirmiti']);
    expect(normalisedName('Nityas Gems & Jewellery Ltd.')).toBe('nityas gems jewellery');
    expect(normalisedName("Shah Investor's Home Limited")).toBe('shah investors home');
    expect(normalisedName('R.K. Fashion Accessories Limited')).toBe('r k fashion accessories');
  });
  it('never treats "X India" as "X"', () => {
    expect(normalisedName('Acme India Industries')).not.toBe(normalisedName('Acme Industries'));
  });
});

describe('matchIssue', () => {
  const known = [
    issue({
      id: 1,
      companyName: 'Vishal Nirmiti Limited',
      nseSymbol: 'VNL',
      openDate: '2026-09-30',
    }),
    issue({
      id: 2,
      companyName: 'A-One Steels India Limited',
      nseSymbol: 'AONESTEELS',
      isin: 'INE0OTC01025',
      openDate: '2026-09-24',
    }),
    issue({ id: 3, companyName: 'Old Co Limited', nseSymbol: 'OLDCO', openDate: '2019-03-01' }),
  ];

  it('prefers ISIN', () => {
    expect(
      matchIssue(
        { ...issue({ id: 0, companyName: 'Different Name' }), isin: 'INE0OTC01025' },
        known,
      ),
    ).toEqual({ kind: 'isin', id: 2 });
  });
  it('matches an NSE symbol only near the same dates', () => {
    expect(
      matchIssue(
        { ...issue({ id: 0, companyName: 'x' }), nseSymbol: 'VNL', openDate: '2026-10-01' },
        known,
      ),
    ).toEqual({ kind: 'nse_symbol', id: 1 });
    // OLDCO reused seven years later is a different issue.
    expect(
      matchIssue(
        {
          ...issue({ id: 0, companyName: 'New Co Limited' }),
          nseSymbol: 'OLDCO',
          openDate: '2026-10-01',
        },
        known,
      ),
    ).toEqual({ kind: 'none' });
  });
  it('never merges an undated record into a dated issue on a reused symbol', () => {
    // A new OLDCO IPO announced without dates is not the 2019 OLDCO issue.
    expect(
      matchIssue({ ...issue({ id: 0, companyName: 'New Co Limited' }), nseSymbol: 'OLDCO' }, known),
    ).toEqual({ kind: 'probable', ids: [3] });
  });
  it('matches a pending, undated issue by its symbol, dated or not', () => {
    const pending = [issue({ id: 9, companyName: 'Pending Co Limited', nseSymbol: 'PEND' })];
    const record = { ...issue({ id: 0, companyName: 'Pending Co' }), nseSymbol: 'PEND' };
    expect(matchIssue({ ...record, openDate: '2026-11-02' }, pending)).toEqual({
      kind: 'nse_symbol',
      id: 9,
    });
    expect(matchIssue(record, pending)).toEqual({ kind: 'nse_symbol', id: 9 });
  });
  it('matches on name only with confirming dates', () => {
    expect(
      matchIssue(
        { ...issue({ id: 0, companyName: 'VISHAL NIRMITI LTD' }), openDate: '2026-09-29' },
        known,
      ),
    ).toEqual({ kind: 'name_dates', id: 1 });
  });
  it('calls a dateless name match probable and does not merge it', () => {
    expect(
      matchIssue({ ...issue({ id: 0, companyName: 'Vishal Nirmiti Limited' }) }, [
        issue({ id: 9, companyName: 'Vishal Nirmiti Limited' }),
      ]),
    ).toEqual({ kind: 'probable', ids: [9] });
  });
  it('does not match across boards', () => {
    expect(
      matchIssue(
        {
          ...issue({ id: 0, companyName: 'Vishal Nirmiti Limited' }),
          board: 'sme',
          openDate: '2026-09-30',
        },
        known,
      ),
    ).toEqual({ kind: 'none' });
  });
});

describe('matchGmpRow', () => {
  const known = [
    issue({
      id: 1,
      companyName: 'A-One Steels India Limited',
      openDate: '2026-09-24',
      closeDate: '2026-09-28',
    }),
    issue({
      id: 2,
      companyName: 'Vishal Nirmiti Limited',
      openDate: '2026-09-30',
      closeDate: '2026-10-05',
    }),
    issue({
      id: 3,
      companyName: 'Nityas Gems and Jewellery Limited',
      openDate: '2026-09-30',
      closeDate: '2026-10-05',
    }),
    issue({
      id: 4,
      companyName: 'R.K. Fashion Accessories Limited',
      board: 'sme',
      openDate: '2026-10-05',
      closeDate: '2026-10-07',
    }),
  ];

  it('matches a shortened aggregator name with matching dates', () => {
    expect(
      matchGmpRow(
        {
          companyName: 'A-One Steels',
          board: 'mainboard',
          openDate: '2026-09-24',
          closeDate: '2026-09-28',
        },
        known,
      ),
    ).toEqual({ kind: 'matched', id: 1 });
    expect(
      matchGmpRow(
        {
          companyName: 'Nityas Gems & Jewellery',
          board: 'mainboard',
          openDate: '2026-09-30',
          closeDate: '2026-10-05',
        },
        known,
      ),
    ).toEqual({ kind: 'matched', id: 3 });
  });
  it('matches "R.K.Fashion" written without a space', () => {
    expect(
      matchGmpRow(
        {
          companyName: 'R.K.Fashion Accessories',
          board: 'sme',
          openDate: '2026-10-05',
          closeDate: '2026-10-07',
        },
        known,
      ),
    ).toEqual({ kind: 'matched', id: 4 });
  });
  it('refuses when the dates disagree, even with the same name', () => {
    expect(
      matchGmpRow(
        {
          companyName: 'Vishal Nirmiti',
          board: 'mainboard',
          openDate: '2026-09-30',
          closeDate: '2026-10-09',
        },
        known,
      ),
    ).toEqual({ kind: 'unmatched' });
  });
  it('refuses on a different board and without dates', () => {
    expect(
      matchGmpRow(
        {
          companyName: 'Vishal Nirmiti',
          board: 'sme',
          openDate: '2026-09-30',
          closeDate: '2026-10-05',
        },
        known,
      ),
    ).toEqual({ kind: 'unmatched' });
    expect(
      matchGmpRow(
        { companyName: 'Vishal Nirmiti', board: 'mainboard', openDate: null, closeDate: null },
        known,
      ),
    ).toEqual({ kind: 'unmatched' });
  });
});

describe('matchListing', () => {
  const known = [
    issue({
      id: 1,
      companyName: 'Roopa Screen Limited',
      board: 'sme',
      openDate: '2026-09-24',
      closeDate: '2026-09-26',
    }),
    issue({
      id: 2,
      companyName: 'Moneyview Limited',
      nseSymbol: 'MONEYVIEW',
      openDate: '2026-09-24',
      closeDate: '2026-09-28',
    }),
    issue({
      id: 3,
      companyName: 'Old Listing Limited',
      nseSymbol: 'OLDCO',
      openDate: '2019-01-01',
      closeDate: '2019-01-03',
    }),
  ];
  it('matches by name within the listing window', () => {
    expect(
      matchListing(
        { companyName: 'ROOPA SCREEN LTD', ticker: null, isin: null, listingDate: '2026-10-01' },
        known,
      ),
    ).toEqual({ kind: 'matched', id: 1 });
  });
  it('matches a dual-listed issue by ticker = NSE symbol', () => {
    expect(
      matchListing(
        {
          companyName: 'MONEYVIEW LTD.',
          ticker: 'MONEYVIEW',
          isin: null,
          listingDate: '2026-10-01',
        },
        known,
      ),
    ).toEqual({ kind: 'matched', id: 2 });
  });
  it('never matches a reused symbol outside the window', () => {
    expect(
      matchListing(
        { companyName: 'New Co Limited', ticker: 'OLDCO', isin: null, listingDate: '2026-10-01' },
        known,
      ),
    ).toEqual({ kind: 'unmatched' });
  });
});

describe('matchFiling', () => {
  const issues = [
    { id: 1, companyName: 'JSW One Platforms Limited', openDate: '2027-02-10' },
    { id: 2, companyName: 'Iris Global Services Ltd.', openDate: null },
    { id: 3, companyName: 'Old Name Industries Limited', openDate: '2025-01-15' },
    { id: 4, companyName: 'Twin Labs Limited', openDate: null },
    { id: 5, companyName: 'Twin Labs Ltd', openDate: null },
  ];

  it('links on the same normalised name when the issue opens after the filing', () => {
    expect(
      matchFiling({ companyName: 'JSW One Platforms Limited', filedDate: '2026-09-25' }, issues),
    ).toBe(1);
    // Case and the legal-form word do not matter.
    expect(
      matchFiling({ companyName: 'IRIS GLOBAL SERVICES LIMITED', filedDate: '2026-09-28' }, issues),
    ).toBe(2);
  });

  it('links nothing for an issue that opened before the filing', () => {
    expect(
      matchFiling({ companyName: 'Old Name Industries Limited', filedDate: '2026-09-01' }, issues),
    ).toBeNull();
  });

  it('links nothing when two issues share the name, or the name merely overlaps', () => {
    expect(
      matchFiling({ companyName: 'Twin Labs Limited', filedDate: '2026-09-01' }, issues),
    ).toBeNull();
    expect(
      matchFiling({ companyName: 'JSW One Limited', filedDate: '2026-09-25' }, issues),
    ).toBeNull();
  });

  it('links nothing past the horizon', () => {
    expect(
      matchFiling({ companyName: 'JSW One Platforms Limited', filedDate: '2025-06-01' }, issues),
    ).toBeNull();
  });
});
