import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractObjects,
  extractPromoters,
  extractRhpSections,
  extractStrengths,
  locate,
  type RhpSpan,
  readToc,
} from './rhp.js';

/**
 * Real text of the Vishal Nirmiti Ltd RHP (NSE, Oct 2026), extracted with
 * pdf.js. Only the pages the extractors read are kept; the rest are blank.
 */
const fixture = JSON.parse(
  readFileSync(new URL('./__fixtures__/rhp-vnl-pages.json', import.meta.url), 'utf8'),
) as { totalPages: number; pages: Record<string, string> };
const vnl = Array.from(
  { length: fixture.totalPages },
  (_, i) => fixture.pages[String(i + 1)] ?? '',
);

/** A span over hand-written lines, all on page 10. */
const spanOf = (text: string): RhpSpan => ({
  from: 10,
  to: 10,
  lines: text.split('\n').map((line) => ({ text: line, page: 10 })),
});

describe('readToc / locate', () => {
  it('reads printed page numbers and drops the SECTION prefix', () => {
    const toc = readToc(vnl);
    expect(toc).toContainEqual({ title: 'RISK FACTORS', printedPage: 21 });
    expect(toc).toContainEqual({ title: 'OBJECTS OF THE OFFER', printedPage: 122 });
    expect(toc).toContainEqual({ title: 'OUR BUSINESS', printedPage: 240 });
  });

  it('finds the PDF page past the front matter (VNL: printed + 6)', () => {
    expect(locate(vnl, { title: 'RISK FACTORS', printedPage: 21 })).toBe(27);
    expect(locate(vnl, { title: 'OUR PROMOTERS AND PROMOTER GROUP', printedPage: 316 })).toBe(322);
  });

  it('returns nothing for a document without a contents page', () => {
    expect(extractRhpSections(['Some cover page', 'Body text'])).toEqual([]);
  });
});

describe('extractRhpSections — Vishal Nirmiti RHP', () => {
  const extracts = extractRhpSections(vnl);
  const section = (name: string) => extracts.find((e) => e.section === name);

  it('reads five sections and skips strengths (un-numbered headings in this RHP)', () => {
    expect(extracts.map((e) => e.section)).toEqual([
      'overview',
      'objects',
      'promoters',
      'financials',
      'risks',
    ]);
  });

  it('quotes the overview from its own page, cut at a sentence end', () => {
    const overview = section('overview');
    expect(overview?.text).toMatch(
      /^We are a civil engineering, manufacturing and construction company/,
    );
    expect(overview?.text).toMatch(/\(b\) Services segment\.$/);
    expect(overview?.pageFrom).toBe(247);
  });

  it('lists the objects with the amounts and unit from the utilisation table', () => {
    expect(section('objects')).toMatchObject({
      items: [
        'Funding Working Capital Requirements of the Company — 7,500.00 (₹ lakh)',
        'Repayment and/ or pre-payment, in part or full of term loans availed by our Company — 1,900.00 (₹ lakh)',
        'General corporate purposes',
      ],
      pageFrom: 128,
      pageTo: 129,
    });
  });

  it('names the nine promoters', () => {
    const promoters = section('promoters');
    expect(promoters?.items).toHaveLength(9);
    expect(promoters?.items[0]).toBe('Brij B Tapadiya');
    expect(promoters?.items[8]).toBe('Keshav Tapadiya');
    expect(promoters?.pageFrom).toBe(322);
  });

  it('keeps restated figures verbatim, with their periods and unit', () => {
    expect(section('financials')?.table).toEqual({
      unit: '₹ lakh',
      columns: ['31 March 2026', '31 March 2025', '31 March 2024'],
      rows: [
        { label: 'Revenue from operations', values: ['33,867.73', '31,851.62', '24,288.20'] },
        { label: 'Total income', values: ['34,413.26', '32,486.36', '24,793.18'] },
        { label: 'Profit after tax', values: ['2,497.50', '2,363.59', '344.56'] },
        { label: 'Total equity (net worth)', values: ['8,678.35', '6,156.22', '3,856.33'] },
        { label: 'Total assets', values: ['33,491.77', '29,660.98', '24,203.76'] },
      ],
    });
  });

  it('reads the numbered risk headings in order, each to its full stop', () => {
    const risks = section('risks');
    expect(risks?.items).toHaveLength(4);
    expect(risks?.items[0]).toMatch(/^Our business and revenues in the manufacturing segment/);
    expect(risks?.items[0]).toMatch(/a change in the terms of our contracts\.$/);
    expect(risks?.items[1]).toMatch(/^We depend significantly on a certain number of customers/);
    expect(risks?.pageFrom).toBe(28);
    expect(risks?.pageTo).toBe(30);
  });
});

describe('extractStrengths', () => {
  it('reads a numbered list that starts under the heading', () => {
    const s = spanOf(
      [
        'Our Competitive Strengths',
        'We believe the following are our principal strengths:',
        '1. Established track record in precision castings',
        'We have supplied castings since 1998 to customers across sectors.',
        '2. Long-standing relationships with marquee customers',
        'Our top ten customers have been with us for over five years.',
        'Our Strategies',
        '1. Expand capacity',
      ].join('\n'),
    );
    expect(extractStrengths(s)?.items).toEqual([
      'Established track record in precision castings',
      'Long-standing relationships with marquee customers',
    ]);
  });

  it('reads consecutive bullets and stops at the first prose line', () => {
    const s = spanOf(
      [
        'Our Strengths',
        '• Diversified product portfolio',
        '• Strong order book',
        'We are the leading maker of…',
        '• Unrelated bullet',
      ].join('\n'),
    );
    expect(extractStrengths(s)?.items).toEqual([
      'Diversified product portfolio',
      'Strong order book',
    ]);
  });

  it('joins a wrapped bullet with its lower-case continuation', () => {
    const s = spanOf(
      [
        'Our Strengths',
        '• Strong relationships with',
        'government customers',
        '• Integrated plants',
      ].join('\n'),
    );
    expect(extractStrengths(s)?.items).toEqual([
      'Strong relationships with government customers',
      'Integrated plants',
    ]);
  });

  it('ignores a bulleted list that does not start right under the heading', () => {
    const s = spanOf(
      [
        'Our Strengths',
        'Execution capabilities with industry experience',
        'Over the years our Company has…',
        'The tender process is:',
        '• Railways float tenders on the portal',
        '• Bidders upload documents',
      ].join('\n'),
    );
    expect(extractStrengths(s)).toBeNull();
  });
});

describe('extractPromoters / extractObjects', () => {
  it('stops the promoter list at the first line out of sequence', () => {
    const s = spanOf(
      ['The Promoters of our Company are:', '1. A Kumar', '2. B Kumar', '4. Not a promoter'].join(
        '\n',
      ),
    );
    expect(extractPromoters(s)?.items).toEqual(['A Kumar', 'B Kumar']);
  });

  it('does not take lettered objects without a stated unit', () => {
    const s = spanOf(
      ['(A) Funding capital expenditure 1,200.00', '(B) Repayment of borrowings 800.00'].join('\n'),
    );
    expect(extractObjects(s)).toBeNull();
  });

  it('keeps `[●]` amounts as unstated', () => {
    const s = spanOf(
      ['(Amount in ₹ crores)', '(a) Purchase of machinery [●]', 'Total [●]'].join('\n'),
    );
    expect(extractObjects(s)?.items).toEqual(['Purchase of machinery']);
  });
});
