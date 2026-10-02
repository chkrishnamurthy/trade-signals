import { describe, expect, it } from 'vitest';
import { classifySubscriptionLabel, isAllowedHost, slugFor } from './catalogue.js';
import { gmpTrackRecord } from './gmp.js';
import { type FieldObservation, resolveFields, type SourceRanking } from './resolve.js';

const RANKING: SourceRanking = {
  designatedExchange: 'BSE',
  exchangeOf: { nse: 'NSE', bse: 'BSE' },
  fallback: ['nse', 'bse', 'sebi'],
};

const obs = (
  over: Partial<FieldObservation> & Pick<FieldObservation, 'field' | 'value' | 'source'>,
): FieldObservation => ({
  url: `https://${over.source}.example/x`,
  observedAt: new Date('2026-10-01T10:00:00Z'),
  basis: 'official',
  ...over,
});

describe('resolveFields', () => {
  it('ranks the designated exchange first, even over the fallback order', () => {
    const { fields, conflicts } = resolveFields(
      [
        obs({ field: 'lotSize', value: 68, source: 'nse' }),
        obs({ field: 'lotSize', value: 68, source: 'bse' }),
      ],
      RANKING,
    );
    expect(fields.lotSize?.provenance.source).toBe('bse');
    expect(fields.lotSize?.provenance.basis).toBe('official');
    expect(conflicts).toEqual([]);
  });
  it('marks a disagreement between official sources as a conflict', () => {
    const { fields, conflicts } = resolveFields(
      [
        obs({ field: 'lotSize', value: 68, source: 'bse' }),
        obs({ field: 'lotSize', value: 70, source: 'nse' }),
      ],
      RANKING,
    );
    expect(fields.lotSize?.value).toBe(68);
    expect(fields.lotSize?.provenance.basis).toBe('conflict');
    expect(conflicts).toEqual([
      {
        field: 'lotSize',
        chosen: { source: 'bse', value: 68 },
        others: [{ source: 'nse', value: 70 }],
      },
    ]);
  });
  it("takes a source's latest observation (its own correction)", () => {
    const { fields } = resolveFields(
      [
        obs({ field: 'priceBand', value: { lowPaise: 1, highPaise: 2 }, source: 'nse' }),
        obs({
          field: 'priceBand',
          value: { lowPaise: 3, highPaise: 4 },
          source: 'nse',
          observedAt: new Date('2026-10-02T10:00:00Z'),
        }),
      ],
      { ...RANKING, designatedExchange: 'NSE' },
    );
    expect(fields.priceBand?.value).toEqual({ lowPaise: 3, highPaise: 4 });
  });
  it('ranks derived values after every official one and ignores nulls', () => {
    const { fields } = resolveFields(
      [
        obs({ field: 'issueSize', value: 1, source: 'equitywise', basis: 'derived' }),
        obs({ field: 'issueSize', value: 2, source: 'sebi' }),
        obs({ field: 'isin', value: null, source: 'nse' }),
      ],
      RANKING,
    );
    expect(fields.issueSize?.value).toBe(2);
    expect(fields.isin).toBeUndefined();
  });
});

describe('classifySubscriptionLabel', () => {
  it('maps the NSE labels', () => {
    expect(classifySubscriptionLabel('Qualified Institutional Buyers(QIBs)')).toBe('qib');
    expect(classifySubscriptionLabel('Non Institutional Investors')).toBe('nii');
    expect(
      classifySubscriptionLabel(
        'Non Institutional Investors(Bid amount of more than Ten Lakh Rupees)',
      ),
    ).toBe('nii_big');
    expect(
      classifySubscriptionLabel(
        'Non Institutional Investors(Bid amount of more than Two Lakh Rupees upto Ten Lakh Rupees)',
      ),
    ).toBe('nii_small');
    // BSE's wording mixes words and digits.
    expect(
      classifySubscriptionLabel(
        'Non Institutional Investors(Bid amount of more than Two Lakh Rupees and upto 10 lakh rupees)',
      ),
    ).toBe('nii_small');
    expect(classifySubscriptionLabel('Retail Individual Investors(RIIs)')).toBe('retail');
    expect(
      classifySubscriptionLabel('Individual Investors (IND category bidding for 2 Lots)'),
    ).toBe('retail');
    expect(classifySubscriptionLabel('Employees')).toBe('employee');
    expect(classifySubscriptionLabel('Total')).toBe('total');
    expect(classifySubscriptionLabel('Mutual funds')).toBe('other');
  });
});

describe('slugFor and isAllowedHost', () => {
  it('builds stable, unique slugs', () => {
    expect(slugFor('Vishal Nirmiti Limited', 2026, new Set())).toBe('vishal-nirmiti-ipo-2026');
    expect(slugFor('Vishal Nirmiti Limited', 2026, new Set(['vishal-nirmiti-ipo-2026']))).toBe(
      'vishal-nirmiti-ipo-2026-2',
    );
    expect(slugFor('A-One Steels India Limited', 2026, new Set())).toBe(
      'a-one-steels-india-ipo-2026',
    );
  });
  it('allows only listed hosts and their subdomains over http(s)', () => {
    const hosts = ['nseindia.com', 'sebi.gov.in'];
    expect(isAllowedHost('https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip', hosts)).toBe(
      true,
    );
    expect(isAllowedHost('https://evilnseindia.com/x', hosts)).toBe(false);
    expect(isAllowedHost('javascript:alert(1)', hosts)).toBe(false);
    expect(isAllowedHost('not a url', hosts)).toBe(false);
  });
});

describe('gmpTrackRecord', () => {
  it('counts outcomes within a tolerance, newest first', () => {
    const record = gmpTrackRecord([
      {
        slug: 'a',
        companyName: 'A',
        listingDate: '2026-10-01',
        lastGmpPercent: 11.36,
        listingGainPercent: 12.35,
      },
      {
        slug: 'b',
        companyName: 'B',
        listingDate: '2026-09-20',
        lastGmpPercent: 40,
        listingGainPercent: 5,
      },
      {
        slug: 'c',
        companyName: 'C',
        listingDate: '2026-09-25',
        lastGmpPercent: 2,
        listingGainPercent: 61.76,
      },
    ]);
    expect(record.total).toBe(3);
    expect(record.within).toBe(1);
    expect(record.gmpAbove).toBe(1);
    expect(record.gmpBelow).toBe(1);
    expect(record.rows.map((r) => r.slug)).toEqual(['a', 'c', 'b']);
    expect(record.rows[0]?.differencePoints).toBeCloseTo(0.99, 2);
  });
});
