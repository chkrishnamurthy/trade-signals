import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSebiDate, parseSebiFilings, splitFilingTitle } from './sebi.js';

const fixture = readFileSync(
  new URL('./__fixtures__/sebi-public-issues.html', import.meta.url),
  'utf8',
);

describe('parseSebiFilings (2026-10-02 page)', () => {
  const filings = parseSebiFilings(fixture);

  it('reads every row of the page', () => {
    expect(filings).toHaveLength(25);
    expect(new Set(filings.map((f) => f.externalKey)).size).toBe(25);
  });

  it('splits the name from the document label and keeps the abridged prospectus', () => {
    expect(filings[0]).toEqual({
      source: 'sebi',
      externalKey: '104866',
      companyName: 'JAGATJIT AGRI ENGINEERING LIMITED',
      documentLabel: 'DRHP',
      title: 'JAGATJIT AGRI ENGINEERING LIMITED - DRHP',
      filedDate: '2026-10-01',
      pageUrl:
        'https://www.sebi.gov.in/filings/public-issues/oct-2026/jagatjit-agri-engineering-limited-drhp_104866.html',
      abridgedUrl:
        'https://www.sebi.gov.in/sebi_data/commondocs/oct-2026/DAP%20Jagatjit%20Agri%20Engineering%20Limited_p.pdf',
    });
  });

  it('keeps an unlabelled filing as a bare name', () => {
    const koolking = filings.find((f) => f.externalKey === '104848');
    expect(koolking).toMatchObject({
      companyName: 'KOOLKING INDUSTRIES INDIA LIMITED',
      documentLabel: null,
      abridgedUrl: null,
    });
  });

  it('labels addenda and updated DRHPs as SEBI names them', () => {
    const labels = new Map(filings.map((f) => [f.companyName, f.documentLabel]));
    expect(labels.get('Arohan Financial Services Limited')).toBe('Addendum to DRHP');
    expect(labels.get('AITMC Ventures Limited')).toBe('UDRHP-I');
    expect(labels.get('Sterlite Electric Limited')).toBe('Second Addendum to DRHP');
    expect(labels.get('German Green Steel and Power Limited')).toBe('Addendum II to DRHP');
    expect(labels.get('Rayzon Solar Limited')).toBe('Addendum to the DRHP');
  });

  it('fails loudly on a page without filings', () => {
    expect(() => parseSebiFilings('<html><body>Maintenance</body></html>')).toThrow(
      /no filing rows/,
    );
  });
});

describe('helpers', () => {
  it('parses SEBI dates', () => {
    expect(parseSebiDate('Oct 01, 2026')).toBe('2026-10-01');
    expect(parseSebiDate('Sep 31, 2026')).toBeNull();
  });

  it('never splits a name that merely contains a dash', () => {
    expect(splitFilingTitle('Hi-Tech Flow Solutions Limited - DRHP')).toEqual({
      companyName: 'Hi-Tech Flow Solutions Limited',
      documentLabel: 'DRHP',
    });
    expect(splitFilingTitle('Agro - Tech Limited')).toEqual({
      companyName: 'Agro - Tech Limited',
      documentLabel: null,
    });
  });
});
