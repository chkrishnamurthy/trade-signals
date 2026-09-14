import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_STATUSES,
  type AnnouncementCategory,
  interpretAnnouncement,
  officialAnnouncementUrl,
} from './announcement-interpretation.js';

const interpret = (headline: string, detail: string | null = null) =>
  interpretAnnouncement({ headline, detail, category: null });
const categories: [string, AnnouncementCategory][] = [
  ['Quarterly results', 'FINANCIAL_RESULTS'],
  ['Dividend', 'DIVIDEND'],
  ['Bonus issue', 'BONUS_ISSUE'],
  ['Stock split', 'STOCK_SPLIT'],
  ['Buyback', 'BUYBACK'],
  ['Rights issue', 'RIGHTS_ISSUE'],
  ['Fundraising', 'FUNDRAISING'],
  ['Order received', 'ORDER_WIN'],
  ['Order amendment', 'ORDER_UPDATE'],
  ['Acquisition', 'ACQUISITION'],
  ['Divestment', 'DIVESTMENT'],
  ['Merger', 'MERGER'],
  ['Capital expenditure', 'CAPEX'],
  ['Credit rating', 'CREDIT_RATING'],
  ['Appointment of director', 'MANAGEMENT_CHANGE'],
  ['Board meeting', 'BOARD_MEETING'],
  ['Annual general meeting', 'SHAREHOLDER_MEETING'],
  ['Show cause notice', 'REGULATORY_LEGAL'],
  ['Related party transaction', 'RELATED_PARTY_TRANSACTION'],
  ['Shareholding', 'SHAREHOLDING'],
  ['Investor presentation', 'INVESTOR_PRESENTATION'],
  ['Clarification', 'CLARIFICATION'],
  ['Correction to quarterly results', 'CORRECTION'],
  ['Cancellation of acquisition', 'CANCELLATION'],
  ['Routine disclosure', 'OTHER'],
];
describe('source-grounded metadata interpretation', () => {
  it.each(categories)('classifies %s without inventing source facts', (headline, category) => {
    const result = interpret(headline);
    expect(result.category).toBe(category);
    expect(result.facts).toEqual([]);
    expect(result.eventStatus).toBe('STATUS_UNKNOWN');
    expect(result.unknowns.length).toBeGreaterThan(0);
    expect(result.scope).toBe('metadata_only');
  });
  it.each(Object.entries(ANNOUNCEMENT_STATUSES))(
    'accepts only explicit status %s',
    (key, label) => {
      expect(interpret('Acquisition', `Event status: ${label}`).eventStatus).toBe(key);
    },
  );
  it.each([
    'Acquisition expected to complete yesterday',
    'Acquisition not completed',
    'Board approval for acquisition',
    'Court order in investigation',
    'Order value ₹100 crore',
    'Dividend subject to approval',
  ])('does not infer status or numbers from %s', (headline) => {
    const result = interpret(headline);
    expect(result.eventStatus).toBe('STATUS_UNKNOWN');
    expect(result.facts).toEqual([]);
  });
  it('keeps conflicting or qualified statuses unknown', () => {
    expect(
      interpret('Acquisition', 'Event status: Completed\nEvent status: Proposed').eventStatus,
    ).toBe('STATUS_UNKNOWN');
    expect(
      interpret('Acquisition', 'Event status: Completed subject to approval').eventStatus,
    ).toBe('STATUS_UNKNOWN');
  });
  it('retains exact source spans, currencies and units without turning order value into profit', () => {
    const input = {
      headline: 'Order received',
      category: null,
      detail:
        'Order value: ₹100 crore, excluding taxes\nCustomer: Not disclosed\nExecution period: 24 months',
    };
    const result = interpretAnnouncement(input);
    expect(result.facts.map((fact) => fact.value)).toEqual([
      '₹100 crore, excluding taxes',
      'Not disclosed',
      '24 months',
    ]);
    for (const fact of result.facts)
      expect(input[fact.evidence.field]?.slice(fact.evidence.start, fact.evidence.end)).toBe(
        fact.evidence.excerpt,
      );
    expect(result.relevance[0]?.explanation).toContain('not current revenue or profit');
    expect(result.facts.some((fact) => fact.label === 'Net profit')).toBe(false);
  });
  it('preserves conditional dates and does not derive ex-date or completion', () => {
    const result = interpret(
      'Dividend',
      'Record date: 20 September 2026\nExpected completion: Subject to approval',
    );
    expect(result.importantDates.map((fact) => fact.label)).toEqual([
      'Record date',
      'Expected completion',
    ]);
    expect(result.eventStatus).toBe('STATUS_UNKNOWN');
  });
  it('does not invent financial comparisons or treat an allegation as a final finding', () => {
    expect(
      interpret('Financial results', 'Revenue: 100 crore').facts.map((fact) => fact.label),
    ).toEqual(['Revenue']);
    const legal = interpret('Court order concerning an allegation');
    expect(legal.category).toBe('REGULATORY_LEGAL');
    expect(legal.relevance[0]?.explanation).toContain('not a final finding');
  });
  it('is deterministic and does not mutate the source', () => {
    const input = Object.freeze({ headline: 'Financial results', detail: null, category: null });
    expect(interpretAnnouncement(input)).toEqual(interpretAnnouncement(input));
  });
  it('does not classify a general court order as an order win', () => {
    expect(interpret('Order of the court').category).toBe('REGULATORY_LEGAL');
    expect(interpret('An order').category).toBe('OTHER');
  });
  it.each([
    'javascript:alert(1)',
    'https://www.bseindia.com.evil.example/doc',
    'http://www.bseindia.com/doc',
    'https://user:pass@www.bseindia.com/doc',
    'https://www.bseindia.com:8443/doc',
    'file:///tmp/a',
  ])('rejects unsafe source URL %s', (url) => expect(officialAnnouncementUrl(url)).toBeNull());
  it('permits official attachment links', () =>
    expect(
      officialAnnouncementUrl('https://www.bseindia.com/xml-data/corpfiling/AttachLive/a.pdf'),
    ).not.toBeNull());
});

it('keeps a completed label unknown when the same metadata contains pending conditions', () => {
  expect(
    interpret('Acquisition', 'Event status: Completed\nSubject to regulatory approval').eventStatus,
  ).toBe('STATUS_UNKNOWN');
});
