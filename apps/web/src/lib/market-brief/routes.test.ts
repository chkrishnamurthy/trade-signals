import { describe, expect, it } from 'vitest';
import { marketBriefHref, parseMarketBriefUniverse } from './routes';

describe('Market Brief routes', () => {
  it.each([
    [undefined, 'all'],
    ['', 'all'],
    ['all', 'all'],
    ['unknown', 'all'],
    [['nifty500'], 'all'],
    ['nifty500', 'nifty500'],
  ] as const)('maps query value %j to the %s universe', (requested, expected) => {
    expect(parseMarketBriefUniverse(requested)).toBe(expected);
  });

  it('keeps the legacy redirect target aligned with the canonical universe URL', () => {
    expect(marketBriefHref('all')).toBe('/today');
    expect(marketBriefHref('nifty500')).toBe('/today?u=nifty500');
  });
});
