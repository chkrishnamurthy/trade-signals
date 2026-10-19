import { describe, expect, it } from 'vitest';
import { withSessionExtremes } from './market-math';

/** Prices are PAISE: 21536 is ₹215.36. */
describe('withSessionExtremes', () => {
  // JIOFIN, 2026-10-01: stored range through the previous close, then a
  // session that traded 213.69–216.20 — below the stored 52-week low.
  const stored = { low52w: 21536, high52w: 31685 };

  it('lowers the 52-week low when the session trades below it', () => {
    expect(withSessionExtremes(stored, 21369, 21620)).toEqual({ low52w: 21369, high52w: 31685 });
  });

  it('raises the 52-week high when the session trades above it', () => {
    expect(withSessionExtremes(stored, 31000, 32000)).toEqual({ low52w: 21536, high52w: 32000 });
  });

  it('leaves the range alone when the session sits inside it', () => {
    expect(withSessionExtremes(stored, 22000, 23000)).toEqual(stored);
  });

  it('is idempotent once the end-of-day pass has included the session', () => {
    const afterClose = { low52w: 21369, high52w: 31685 };
    expect(withSessionExtremes(afterClose, 21369, 21620)).toEqual(afterClose);
  });

  it('never invents a range the worker has not computed', () => {
    expect(withSessionExtremes({ low52w: null, high52w: null }, 21369, 21620)).toEqual({
      low52w: null,
      high52w: null,
    });
  });

  it('ignores a missing or zero session price', () => {
    expect(withSessionExtremes(stored, null, null)).toEqual(stored);
    expect(withSessionExtremes(stored, 0, 0)).toEqual(stored);
  });
});
