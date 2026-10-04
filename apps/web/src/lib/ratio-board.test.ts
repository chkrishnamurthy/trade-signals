import { describe, expect, it } from 'vitest';
import { buildTile, cuePosition, ratiosCsv } from './ratio-board';
import type { MetricDto } from './screener-types';

const metric = (key: string, unit: MetricDto['unit'], decimals: number | null = 1): MetricDto => ({
  key,
  label: key,
  category: 'price',
  unit,
  description: `${key} description`,
  decimals,
  options: null,
});

const metrics = new Map(
  [
    metric('close', 'paise'),
    metric('changePct', 'percent', 2),
    metric('rsi14', 'score'),
    metric('dist52wHigh', 'percent'),
    metric('deliveryPct', 'percent'),
    metric('avgDelivery20', 'percent'),
  ].map((m) => [m.key, m]),
);
const extras = new Map([
  ['range52w', { label: '52W high / low', description: 'range' }],
  ['faceValue', { label: 'Face value', description: 'fv' }],
]);

describe('buildTile', () => {
  const values = {
    close: 72_100,
    changePct: 1.76,
    high52w: 102_000,
    low52w: 68_200,
    rsi14: 48.2,
    dist52wHigh: -29.3,
    deliveryPct: 58.4,
    avgDelivery20: 41,
  };

  it('formats the value and adds the companion line', () => {
    const close = buildTile('close', metrics, values, extras, null);
    expect(close?.value.text).toBe('₹721.00');
    expect(close?.context).toBe('+1.76% on the session');
  });

  it('draws the 52-week ribbon with the close’s position', () => {
    // (72100 − 68200) / (102000 − 68200) = 3900 / 33800 = 11.5% → "12%".
    const tile = buildTile('range52w', metrics, values, extras, null);
    expect(tile?.value.text).toBe('₹1,020.00 / ₹682.00');
    expect(tile?.cue).toEqual({ kind: 'range', low: 68_200, high: 102_000, value: 72_100 });
    expect(tile?.context).toBe('Close at 12% of the range');
  });

  it('meters bounded readings and compares delivery with its average', () => {
    expect(buildTile('rsi14', metrics, values, extras, null)?.cue).toEqual({
      kind: 'meter',
      value: 48.2,
      min: 0,
      max: 100,
      ticks: [30, 70],
      compare: null,
    });
    expect(buildTile('deliveryPct', metrics, values, extras, null)?.cue).toMatchObject({
      compare: 41,
    });
  });

  it('draws signed moves from the centre', () => {
    expect(buildTile('dist52wHigh', metrics, values, extras, null)?.cue).toEqual({
      kind: 'diverge',
      value: -29.3,
      scale: 60,
    });
  });

  it('shows face value from reference data and dashes what is unknown', () => {
    expect(buildTile('faceValue', metrics, values, extras, 100)?.value.text).toBe('₹1.00');
    expect(buildTile('faceValue', metrics, values, extras, null)?.value.text).toBe('—');
    expect(buildTile('rsi14', metrics, null, extras, null)?.value.text).toBe('—');
    expect(buildTile('rsi14', metrics, null, extras, null)?.cue).toBeNull();
  });

  it('skips a key the viewer’s catalogue does not have', () => {
    expect(buildTile('signalStrength', metrics, values, extras, null)).toBeNull();
  });
});

describe('cuePosition', () => {
  it('clamps to the track', () => {
    expect(cuePosition(50, 0, 100)).toBe(50);
    expect(cuePosition(-5, 0, 100)).toBe(0);
    expect(cuePosition(500, 0, 4)).toBe(100);
    expect(cuePosition(1, 1, 1)).toBe(0);
  });
});

describe('ratiosCsv', () => {
  it('writes a BOM, quotes commas and keeps the session on every row', () => {
    const csv = ratiosCsv({
      symbol: 'HDFCBANK',
      session: '2026-10-01',
      tiles: [
        {
          key: 'range52w',
          label: '52W high / low',
          description: '',
          value: { text: '₹1,020 / ₹682', tone: null, badge: false },
          cue: null,
          context: null,
        },
      ],
      profile: [['Indices', 'Nifty 50, Nifty Bank']],
    });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Ratio,52W high / low,"₹1,020 / ₹682",,2026-10-01\r\n');
    expect(csv).toContain('Profile,Indices,"Nifty 50, Nifty Bank",,2026-10-01\r\n');
  });
});
