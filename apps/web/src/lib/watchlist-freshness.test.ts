import { describe, expect, it } from 'vitest';
import { quoteUpdatesDelayed } from './watchlist-freshness';

describe('quoteUpdatesDelayed', () => {
  it('warns when quote updates fall behind during continuous trading', () => {
    expect(
      quoteUpdatesDelayed({ market: { isOpen: true, phase: 'open' }, quotesStale: true }),
    ).toBe(true);
  });

  it.each(['closed', 'post_close', 'pre_open', 'unknown'] as const)(
    'does not call unchanged prices delayed while the market is %s',
    (phase) => {
      expect(quoteUpdatesDelayed({ market: { isOpen: false, phase }, quotesStale: true })).toBe(
        false,
      );
    },
  );

  it('does not warn when open-session quotes are current', () => {
    expect(
      quoteUpdatesDelayed({ market: { isOpen: true, phase: 'open' }, quotesStale: false }),
    ).toBe(false);
  });
});
