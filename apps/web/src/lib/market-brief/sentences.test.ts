import { describe, expect, it } from 'vitest';
import {
  conditionExplanation,
  countNoun,
  eventExplanation,
  headlineSentence,
  joinClauses,
  outOf,
  signedPercent,
} from './sentences';
import type { SessionInstrumentFacts } from './types';

const facts = (partial: Partial<SessionInstrumentFacts> = {}): SessionInstrumentFacts => ({
  instrumentId: 1,
  symbol: 'ACME',
  name: 'Acme',
  sector: null,
  close: 100_00,
  changePercent: 1,
  sma20: null,
  sma50: null,
  rsi14: null,
  macdHistogram: null,
  relativeVolume: null,
  barCount: 120,
  ...partial,
});

describe('countNoun', () => {
  it('uses the singular for exactly one', () => {
    expect(countNoun(1, 'stock')).toBe('1 stock');
  });
  it('uses the plural for zero and many', () => {
    expect(countNoun(0, 'stock')).toBe('0 stocks');
    expect(countNoun(5, 'stock')).toBe('5 stocks');
  });
  it('honours an irregular plural', () => {
    expect(countNoun(2, 'index', 'indices')).toBe('2 indices');
  });
});

describe('outOf', () => {
  it('always shows the denominator', () => {
    expect(outOf(32, 50)).toBe('32 of 50');
  });
});

describe('signedPercent', () => {
  it('prefixes a plus for gains', () => {
    expect(signedPercent(1.23)).toBe('+1.2%');
  });
  it('keeps the minus for losses', () => {
    expect(signedPercent(-0.44)).toBe('-0.4%');
  });
  it('normalises negative-zero to a clean zero', () => {
    expect(signedPercent(-0.01)).toBe('0.0%');
  });
});

describe('joinClauses', () => {
  it('joins with an Oxford comma', () => {
    expect(joinClauses(['a', 'b', 'c'])).toBe('a, b, and c');
  });
  it('uses a bare "and" for two', () => {
    expect(joinClauses(['a', 'b'])).toBe('a and b');
  });
  it('returns a lone clause unchanged', () => {
    expect(joinClauses(['a'])).toBe('a');
  });
});

describe('headlineSentence', () => {
  it('uses the singular for one new setup', () => {
    const sentence = headlineSentence({
      label: 'mixed',
      advances: 29,
      directionCovered: 50,
      above20: 32,
      above20Total: 50,
      newBullishSetups: 1,
    });
    expect(sentence).toContain('1 new bullish setup was detected');
    expect(sentence).toContain('29 of 50 stocks advanced');
    expect(sentence).toContain('32 held above their 20-day average');
  });

  it('uses the plural for several new setups', () => {
    const sentence = headlineSentence({
      label: 'bullish',
      advances: 40,
      directionCovered: 50,
      above20: 45,
      above20Total: 50,
      newBullishSetups: 5,
    });
    expect(sentence).toContain('5 new bullish setups were detected');
  });

  it('omits the 20-day clause when the metric is unavailable', () => {
    const sentence = headlineSentence({
      label: 'mixed',
      advances: 20,
      directionCovered: 40,
      above20: null,
      above20Total: null,
      newBullishSetups: 0,
    });
    expect(sentence).not.toContain('20-day');
    expect(sentence).toContain('20 of 40 stocks advanced');
  });

  it('degrades to a bare lead for insufficient data', () => {
    const sentence = headlineSentence({
      label: 'insufficient_data',
      advances: 0,
      directionCovered: 0,
      above20: null,
      above20Total: null,
      newBullishSetups: 0,
    });
    expect(sentence).toBe('There was not enough completed data to describe market conditions.');
  });
});

describe('conditionExplanation', () => {
  it('reports the balance clause when advances and declines are close', () => {
    const text = conditionExplanation({
      label: 'mixed',
      advances: 24,
      declines: 25,
      directionCovered: 49,
      above20: 32,
      above20Total: 50,
      above50: 28,
      above50Total: 50,
      availableInstruments: 50,
      expectedInstruments: 50,
    });
    expect(text).toContain('32 of 50 stocks closed above their 20-day average');
    expect(text).toContain('advancing and declining stocks were nearly balanced');
  });

  it('names the coverage shortfall for insufficient data', () => {
    const text = conditionExplanation({
      label: 'insufficient_data',
      advances: 5,
      declines: 5,
      directionCovered: 10,
      above20: null,
      above20Total: null,
      above50: null,
      above50Total: null,
      availableInstruments: 12,
      expectedInstruments: 50,
    });
    expect(text).toContain('12 of 50');
    expect(text).toContain('too few to classify');
  });
});

describe('eventExplanation', () => {
  it('describes a moving-average cross', () => {
    expect(eventExplanation('crossed_above_ma20', facts())).toBe(
      'Price crossed above its 20-day moving average.',
    );
  });
  it('includes the relative-volume multiple when present', () => {
    expect(eventExplanation('unusual_volume', facts({ relativeVolume: 2.4 }))).toContain('2.4×');
  });
  it('falls back gracefully when the baseline is absent', () => {
    expect(eventExplanation('unusual_volume', facts({ relativeVolume: null }))).toBe(
      'Unusual trading volume was recorded.',
    );
  });
});
