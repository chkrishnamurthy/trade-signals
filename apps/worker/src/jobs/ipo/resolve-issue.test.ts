import { readFileSync } from 'node:fs';
import type { SourceObservationRow } from '@equitywise/db';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseIpoSourcesConfig } from '../../sources/ipo/config.js';
import { exchangesFrom, lifecycleFrom, observationsFrom, resolvePatch } from './resolve-issue.js';

const config = parseIpoSourcesConfig(
  parse(readFileSync(new URL('../../../../../config/ipo-sources.yaml', import.meta.url), 'utf8')),
);

const row = (
  over: Partial<SourceObservationRow> & Pick<SourceObservationRow, 'feed' | 'payload'>,
): SourceObservationRow => ({
  source: 'nse',
  externalKey: 'nse:VNL:EQ:2026-09-30',
  sourceUrl: `https://www.nseindia.com/${over.feed}`,
  lastSeenAt: new Date('2026-10-02T03:10:00Z'),
  ...over,
});

const calendar = row({
  feed: 'calendar',
  payload: {
    companyName: 'Vishal Nirmiti Limited',
    board: 'mainboard',
    symbol: 'VNL',
    series: 'EQ',
    openDate: '2026-09-30',
    closeDate: '2026-10-05',
    priceBand: { lowPaise: 20_800, highPaise: 22_000 },
    lotSize: null,
    sharesOffered: 8_471_153,
  },
});

const detail = row({
  feed: 'detail',
  lastSeenAt: new Date('2026-10-02T02:20:00Z'),
  payload: {
    companyName: 'Vishal Nirmiti Limited',
    openDate: '2026-09-30',
    closeDate: '2026-10-05',
    upiCutoffAt: '2026-10-05T11:30:00.000Z',
    issueMethod: 'book_building',
    priceBand: { lowPaise: 20_800, highPaise: 22_000 },
    faceValuePaise: 1_000,
    lotSize: 68,
    minBidQuantity: 68,
    retailMaxPaise: 20_000_000,
    issueSizeText:
      'Initial Public Offering comprising fresh issue aggregating up to 14500 lakhs and offer for sale up to 15,00,000 Equity Shares',
    leadManagers: ['Saffron Capital Advisors Private Limited'],
    sponsorBanks: ['HDFC Bank Limited'],
    registrarName: 'MUFG Intime India Private Limited',
  },
});

describe('observationsFrom', () => {
  it('lets the detail feed win a field over the calendar from the same source, even when older', () => {
    const lot = observationsFrom([
      calendar,
      row({ ...calendar, payload: { ...calendar.payload, lotSize: 70 } }),
      detail,
    ]).filter((o) => o.field === 'lotSize');
    expect(lot).toHaveLength(1);
    expect(lot[0]?.value).toBe(68);
  });
  it('ignores feeds that are not issue facts', () => {
    expect(observationsFrom([row({ feed: 'gmp', payload: { gmpPaise: 2_000 } })])).toEqual([]);
  });
});

describe('resolvePatch', () => {
  const now = new Date('2026-10-02T04:00:00Z');
  const patch = resolvePatch([calendar, detail], config, now);

  it('fills canonical columns with official values and provenance', () => {
    expect(patch).toMatchObject({
      companyName: 'Vishal Nirmiti Limited',
      nseSymbol: 'VNL',
      nseSeries: 'EQ',
      openDate: '2026-09-30',
      closeDate: '2026-10-05',
      priceBandLowPaise: 20_800,
      priceBandHighPaise: 22_000,
      lotSize: 68,
      faceValuePaise: 1_000,
      sharesOffered: 8_471_153,
      registrarName: 'MUFG Intime India Private Limited',
      leadManagers: ['Saffron Capital Advisors Private Limited'],
      exchanges: ['NSE'],
      designatedExchange: 'NSE',
    });
    expect(patch.upiCutoffAt).toEqual(new Date('2026-10-05T11:30:00.000Z'));
    expect(patch.fieldSources.lotSize).toMatchObject({
      source: 'nse',
      basis: 'official',
      url: 'https://www.nseindia.com/detail',
    });
    expect(patch.fieldSources.exchanges?.basis).toBe('derived');
  });

  it('splits the issue-size sentence into official parts', () => {
    expect(patch.freshIssuePaise).toBe(145_000_000_000);
    expect(patch.ofsShares).toBe(1_500_000);
    expect(patch.freshIssueShares).toBeNull();
    expect(patch.fieldSources.freshIssuePaise?.source).toBe('nse');
  });

  it('never moves an issue across boards', () => {
    expect('board' in patch).toBe(false);
  });
});

describe('exchangesFrom', () => {
  it('lists each official source exchange once', () => {
    expect(
      exchangesFrom([calendar, detail, row({ ...calendar, source: 'bse' })], {
        nse: 'NSE',
        bse: 'BSE',
      }),
    ).toEqual(['BSE', 'NSE']);
  });
});

describe('listingDayCheck', () => {
  it('accepts the debut row only when the previous close is the issue price', async () => {
    const { listingDayCheck } = await import('../ingest-ipos.js');
    const band = { priceBandLowPaise: 38_500, priceBandHighPaise: 40_500 };
    expect(
      listingDayCheck({ prevClosePaise: 40_500 }, { ...band, issuePricePaise: 40_500 }),
    ).toEqual({
      ok: true,
      issuePricePaise: 40_500,
    });
    expect(
      listingDayCheck({ prevClosePaise: 41_000 }, { ...band, issuePricePaise: 40_500 }).ok,
    ).toBe(false);
    // Before the final price is known, inside the band is enough.
    expect(listingDayCheck({ prevClosePaise: 40_000 }, { ...band, issuePricePaise: null })).toEqual(
      {
        ok: true,
        issuePricePaise: 40_000,
      },
    );
    expect(listingDayCheck({ prevClosePaise: 99_000 }, { ...band, issuePricePaise: null }).ok).toBe(
      false,
    );
  });
  it('uses the official issue price when the file has no previous close (BSE)', async () => {
    const { listingDayCheck } = await import('../ingest-ipos.js');
    const band = { priceBandLowPaise: 6_000, priceBandHighPaise: 6_400 };
    expect(listingDayCheck({ prevClosePaise: null }, { ...band, issuePricePaise: 6_400 })).toEqual({
      ok: true,
      issuePricePaise: 6_400,
    });
    expect(listingDayCheck({ prevClosePaise: null }, { ...band, issuePricePaise: null }).ok).toBe(
      false,
    );
  });
});

describe('lifecycleFrom (withdrawn / postponed only when a source says so)', () => {
  const status = (sourceStatus: string, at: string, source = 'nse') =>
    row({
      source,
      feed: 'calendar',
      lastSeenAt: new Date(at),
      payload: { ...calendar.payload, sourceStatus },
    });

  it('takes the latest stated status and clears a stale override', () => {
    const postponed = status('Postponed', '2026-10-01T03:00:00Z');
    expect(lifecycleFrom([postponed], ['nse']).override).toBe('postponed');
    const active = status('Active', '2026-10-02T03:00:00Z');
    expect(lifecycleFrom([postponed, active], ['nse'])).toEqual({
      override: null,
      provenance: null,
    });
  });
  it('hears the designated exchange first', () => {
    const nse = status('Active', '2026-10-02T03:00:00Z');
    const bse = status('Withdrawn', '2026-10-02T04:00:00Z', 'bse');
    expect(lifecycleFrom([nse, bse], ['nse', 'bse']).override).toBeNull();
    expect(lifecycleFrom([nse, bse], ['bse', 'nse']).override).toBe('withdrawn');
  });
  it('writes the override with provenance through resolvePatch, and null otherwise', () => {
    const withdrawn = status('Withdrawn', '2026-10-02T05:00:00Z');
    const patch = resolvePatch([withdrawn], config, new Date('2026-10-02T06:00:00Z'));
    expect(patch.lifecycleOverride).toBe('withdrawn');
    expect(patch.fieldSources.lifecycleOverride?.source).toBe('nse');
    expect(resolvePatch([calendar], config, new Date()).lifecycleOverride).toBeNull();
  });
});
