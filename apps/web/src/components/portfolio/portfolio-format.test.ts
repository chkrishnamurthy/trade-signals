import { describe, expect, it } from 'vitest';
import { paiseToPlain, parseRupeesInput } from './portfolio-format';

describe('parseRupeesInput', () => {
  it('reads rupees to exact paise', () => {
    expect(parseRupeesInput('1,245.50')).toBe(124550);
    expect(parseRupeesInput('₹10')).toBe(1000);
    expect(parseRupeesInput('16.5')).toBe(1650);
    expect(parseRupeesInput('0.07')).toBe(7);
  });
  it('rejects anything else', () => {
    expect(parseRupeesInput('')).toBeNull();
    expect(parseRupeesInput('1.234')).toBeNull();
    expect(parseRupeesInput('abc')).toBeNull();
    expect(parseRupeesInput('-5')).toBeNull();
  });
});

describe('paiseToPlain', () => {
  it('formats without a float', () => {
    expect(paiseToPlain(124550)).toBe('1245.50');
    expect(paiseToPlain(7)).toBe('0.07');
    expect(paiseToPlain(-4822400)).toBe('-48224.00');
  });
});
