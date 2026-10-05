import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { symbolCandidates, todayInIndia } = await import('./portfolio');

describe('symbolCandidates', () => {
  it('tries the symbol as written, then without a broker series suffix', () => {
    expect(symbolCandidates('itc')).toEqual(['ITC']);
    expect(symbolCandidates('URJA-BE')).toEqual(['URJA-BE', 'URJA']);
    expect(symbolCandidates('M&M')).toEqual(['M&M']);
  });
});

describe('todayInIndia', () => {
  it('uses the Indian calendar day, not UTC', () => {
    // 21:00 UTC on the 4th is 02:30 IST on the 5th.
    expect(todayInIndia(new Date('2026-10-04T21:00:00Z'))).toBe('2026-10-05');
    expect(todayInIndia(new Date('2026-10-05T10:00:00Z'))).toBe('2026-10-05');
  });
});
