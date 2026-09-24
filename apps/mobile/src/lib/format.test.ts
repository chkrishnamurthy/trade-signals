import { describe, expect, it } from 'vitest';
import {
  arrow,
  istDate,
  istDateTime,
  istTime,
  marketPhaseLabel,
  percent,
  percentChange,
  price,
  signedPrice,
  tone,
  volume,
} from './format';

describe('app formatting', () => {
  it('formats paise through formatPaise only, with a dash for missing', () => {
    expect(price(124550)).toBe('₹1,245.50');
    expect(price(12455000)).toBe('₹1,24,550.00');
    expect(price(null)).toBe('—');
    expect(signedPrice(1240)).toBe('+₹12.40');
    expect(signedPrice(-305)).toBe('-₹3.05');
    expect(signedPrice(0)).toBe('₹0.00');
  });

  it('refuses rupees-as-float (hard rule 3)', () => {
    expect(() => price(1245.5)).toThrow(RangeError);
  });

  it('formats percentages with an explicit sign', () => {
    expect(percent(1.2345)).toBe('+1.23%');
    expect(percent(-0.5)).toBe('-0.50%');
    expect(percent(-0.001)).toBe('0.00%');
    expect(percent(null)).toBe('—');
    expect(percentChange(10000, 11000)).toBeCloseTo(10);
    expect(percentChange(0, 100)).toBeNull();
  });

  it('uses Indian compact volume units', () => {
    expect(volume(123456789)).toBe('12.35 Cr');
    expect(volume(4560000)).toBe('45.60 L');
    expect(volume(12345)).toBe('12,345');
  });

  it('never relies on colour alone', () => {
    expect([tone(5), arrow(5)]).toEqual(['positive', '▲']);
    expect([tone(-5), arrow(-5)]).toEqual(['negative', '▼']);
    expect([tone(0), arrow(null)]).toEqual(['neutral', '•']);
  });

  it('renders instants in IST regardless of the device timezone', () => {
    expect(istTime('2026-09-24T03:45:00.000Z')).toBe('09:15 IST');
    expect(istDate('2026-09-23T20:00:00.000Z')).toBe('24 Sep 2026');
    expect(istDate('2026-09-24')).toBe('24 Sep 2026');
    expect(istDateTime(Date.UTC(2026, 8, 24, 10, 0))).toBe('24 Sep, 15:30 IST');
  });

  it('never shows an unknown market as closed', () => {
    expect(marketPhaseLabel('unknown')).toBe('Market status unknown');
    expect(marketPhaseLabel('weird')).toBe('Market status unknown');
  });
});
