import { describe, expect, it } from 'vitest';
import { niceScale, niceStep } from './chart-scale';
import { croreTick, largeCurrency, signedCrore } from './format';

describe('niceStep', () => {
  it('rounds up onto the 1 / 2 / 2.5 / 5 / 10 ladder', () => {
    expect(niceStep(0.8)).toBe(1);
    expect(niceStep(1.7)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(3.1)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(1_730)).toBe(2_000);
  });
});

describe('niceScale', () => {
  it('brackets a signed range on round ticks that include zero', () => {
    // Span 7,800 / 4 intervals = 1,950 -> rounds up to a 2,000 step;
    // floor(-3,100 / 2,000) = -2 and ceil(4,700 / 2,000) = 3.
    const scale = niceScale(-3_100, 4_700, { target: 4 });
    expect(scale.step).toBe(2_000);
    expect(scale.ticks).toEqual([-4_000, -2_000, 0, 2_000, 4_000, 6_000]);
    expect(scale.min).toBe(-4_000);
    expect(scale.max).toBe(6_000);
  });

  it('keeps paise-sized money ticks integral', () => {
    // ₹-2,345 Cr .. ₹6,789 Cr in paise.
    const scale = niceScale(-2_345_000_000_000, 6_789_000_000_000, { target: 6, integer: true });
    expect(scale.step).toBe(2_000_000_000_000);
    expect(scale.ticks.every(Number.isInteger)).toBe(true);
    expect(scale.ticks.at(0)).toBe(-4_000_000_000_000);
    expect(scale.ticks.at(-1)).toBe(8_000_000_000_000);
  });

  it('widens a flat range so the axis still has height', () => {
    const scale = niceScale(0, 0);
    expect(scale.max).toBeGreaterThan(scale.min);
    expect(scale.ticks).toContain(0);
  });
});

describe('croreTick', () => {
  const CRORE = 1_000_000_000;

  it('prints whole crore with Indian grouping when the step is a crore or more', () => {
    expect(croreTick(1_200 * CRORE, 500 * CRORE)).toBe('1,200');
    expect(croreTick(-12_500 * CRORE, 2_500 * CRORE)).toBe('−12,500');
    expect(croreTick(0, 500 * CRORE)).toBe('0');
  });

  it('adds decimals only when the step is finer than a crore', () => {
    expect(croreTick(CRORE / 4, CRORE / 4)).toBe('0.25');
    expect(croreTick(-CRORE / 2, CRORE / 2)).toBe('−0.5');
  });

  it('never prints a negative zero', () => {
    expect(croreTick(-1, 500 * CRORE)).toBe('0');
  });
});

describe('signedCrore', () => {
  const CRORE = 1_000_000_000;

  it('signs, groups and keeps two decimals', () => {
    expect(signedCrore(4_210.8 * CRORE)).toBe('+₹4,210.80 Cr');
    expect(signedCrore(-5_027.4 * CRORE)).toBe('−₹5,027.40 Cr');
    expect(signedCrore((-12_34_567 * CRORE) / 100)).toBe('−₹12,345.67 Cr');
  });

  it('drops the unit on request, and the sign on zero', () => {
    expect(signedCrore(2_950.6 * CRORE, { unit: false })).toBe('+₹2,950.60');
    expect(signedCrore(0)).toBe('₹0.00 Cr');
    expect(signedCrore(null)).toBe('—');
  });
});

describe('largeCurrency', () => {
  it('groups digits the Indian way', () => {
    expect(largeCurrency(13_263.31 * 1_000_000_000)).toBe('₹13,263.31 Cr');
    expect(largeCurrency(2_50_000_00)).toBe('₹2.50 L');
  });
});
