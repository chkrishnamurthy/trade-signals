import { describe, expect, it } from 'vitest';
import {
  assertPaise,
  formatPaise,
  PAISE_PER_RUPEE,
  paiseToRupees,
  rupeesToPaise,
} from './money.js';

describe('PAISE_PER_RUPEE', () => {
  it('is 100', () => {
    expect(PAISE_PER_RUPEE).toBe(100);
  });
});

describe('rupeesToPaise', () => {
  it('converts the canonical example from CLAUDE.md', () => {
    expect(rupeesToPaise(1245.5)).toBe(124550);
    expect(rupeesToPaise('1245.50')).toBe(124550);
  });

  it('converts whole rupees', () => {
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(1)).toBe(100);
    expect(rupeesToPaise(2500)).toBe(250000);
    expect(rupeesToPaise('2500')).toBe(250000);
  });

  it('converts sub-rupee amounts', () => {
    expect(rupeesToPaise(0.01)).toBe(1);
    expect(rupeesToPaise(0.05)).toBe(5);
    expect(rupeesToPaise('.75')).toBe(75);
    expect(rupeesToPaise('0.10')).toBe(10);
  });

  it('handles a single decimal place as tenths, not hundredths', () => {
    expect(rupeesToPaise('1245.5')).toBe(124550);
    expect(rupeesToPaise('0.5')).toBe(50);
  });

  it('is immune to binary float error', () => {
    // 0.1 + 0.2 === 0.30000000000000004; naive Math.round(x * 100) still gets
    // this one right, but the string path must not drift either.
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(rupeesToPaise(1.005)).toBe(101);
    expect(rupeesToPaise('1.005')).toBe(101);
    expect(rupeesToPaise(8.115)).toBe(812);
    expect(rupeesToPaise(1.0049999)).toBe(100);
  });

  it('rounds excess precision half-away-from-zero', () => {
    expect(rupeesToPaise('1245.504')).toBe(124550);
    expect(rupeesToPaise('1245.505')).toBe(124551);
    expect(rupeesToPaise('1245.509')).toBe(124551);
    expect(rupeesToPaise('-1245.505')).toBe(-124551);
    expect(rupeesToPaise('0.0049')).toBe(0);
    expect(rupeesToPaise('0.005')).toBe(1);
  });

  it('handles signs', () => {
    expect(rupeesToPaise(-1245.5)).toBe(-124550);
    expect(rupeesToPaise('-1245.50')).toBe(-124550);
    expect(rupeesToPaise('+1245.50')).toBe(124550);
  });

  it('never produces negative zero', () => {
    for (const input of [-0, '-0', '-0.00', '-0.001', -1e-7] as const) {
      expect(Object.is(rupeesToPaise(input), 0), String(input)).toBe(true);
    }
  });

  it('trims surrounding whitespace on string input', () => {
    expect(rupeesToPaise('  1245.50  ')).toBe(124550);
  });

  it('reads numbers in exponential notation', () => {
    expect(rupeesToPaise(1e6)).toBe(100_000_000);
    expect(rupeesToPaise(1.5e-2)).toBe(2);
    // String(1e-7) is "1e-7"; the parser must not choke on the exponent form.
    expect(rupeesToPaise(1e-7)).toBe(0);
    expect(rupeesToPaise(-1e-7)).toBe(0);
  });

  it('rejects non-finite numbers', () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow(RangeError);
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => rupeesToPaise(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('rejects unparseable strings', () => {
    for (const bad of ['', '   ', 'abc', '1,245.50', '₹1245.50', '1.2.3', '1e5', '--1']) {
      expect(() => rupeesToPaise(bad), bad).toThrow(RangeError);
    }
  });

  it('rejects amounts beyond the safe integer range', () => {
    expect(() => rupeesToPaise('999999999999999999')).toThrow(RangeError);
  });
});

describe('paiseToRupees', () => {
  it('converts back to rupees', () => {
    expect(paiseToRupees(124550)).toBe(1245.5);
    expect(paiseToRupees(0)).toBe(0);
    expect(paiseToRupees(1)).toBe(0.01);
    expect(paiseToRupees(-124550)).toBe(-1245.5);
  });

  it('round-trips through rupeesToPaise', () => {
    for (const paise of [0, 1, 99, 100, 124550, 999999, -124550]) {
      expect(rupeesToPaise(paiseToRupees(paise))).toBe(paise);
    }
  });

  it('rejects non-integer paise, which is always a bug upstream', () => {
    expect(() => paiseToRupees(1245.5)).toThrow(RangeError);
    expect(() => paiseToRupees(Number.NaN)).toThrow(RangeError);
    expect(() => paiseToRupees(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('assertPaise', () => {
  it('accepts safe integers', () => {
    expect(() => assertPaise(0)).not.toThrow();
    expect(() => assertPaise(-124550)).not.toThrow();
  });

  it('names the offending value in the message', () => {
    expect(() => assertPaise(1.5, 'entryPrice')).toThrow(/entryPrice: expected integer paise/);
  });
});

describe('formatPaise', () => {
  it('formats with the rupee sign and two decimals', () => {
    expect(formatPaise(124550)).toBe('₹1,245.50');
    expect(formatPaise(0)).toBe('₹0.00');
    expect(formatPaise(1)).toBe('₹0.01');
  });

  it('groups in the Indian lakh/crore system', () => {
    expect(formatPaise(12455000)).toBe('₹1,24,550.00');
    expect(formatPaise(1245500000)).toBe('₹1,24,55,000.00');
    expect(formatPaise(100000)).toBe('₹1,000.00');
  });

  it('places the sign outside the symbol for negatives', () => {
    expect(formatPaise(-124550)).toBe('-₹1,245.50');
  });

  it('omits the symbol on request', () => {
    expect(formatPaise(124550, { withSymbol: false })).toBe('1,245.50');
    expect(formatPaise(-124550, { withSymbol: false })).toBe('-1,245.50');
  });

  it('honours the decimals option', () => {
    expect(formatPaise(124550, { decimals: 0 })).toBe('₹1,246');
    expect(formatPaise(124540, { decimals: 0 })).toBe('₹1,245');
    expect(formatPaise(124550, { decimals: 1 })).toBe('₹1,245.5');
  });

  it('honours signDisplay', () => {
    expect(formatPaise(124550, { signDisplay: 'always' })).toBe('+₹1,245.50');
    expect(formatPaise(-124550, { signDisplay: 'never' })).toBe('₹1,245.50');
    expect(formatPaise(0, { signDisplay: 'exceptZero' })).toBe('₹0.00');
  });

  it('groups very large amounts correctly', () => {
    expect(formatPaise(900719925474099)).toBe('₹90,07,19,92,54,740.99');
  });

  it('never loses the paise digits, at any magnitude', () => {
    // The formatter routes an exact decimal string into Intl rather than a
    // rupee float, so the last two digits are always the paise remainder.
    for (const paise of [1, 99, 12345, 987654321, 900719925474099]) {
      const rendered = formatPaise(paise, { withSymbol: false });
      expect(rendered.slice(-2), String(paise)).toBe(String(paise % 100).padStart(2, '0'));
    }
  });

  it('rejects non-integer paise', () => {
    expect(() => formatPaise(1245.5)).toThrow(RangeError);
  });

  it('rejects a nonsense decimals option', () => {
    expect(() => formatPaise(100, { decimals: 3 })).toThrow(RangeError);
    expect(() => formatPaise(100, { decimals: -1 })).toThrow(RangeError);
    expect(() => formatPaise(100, { decimals: 1.5 })).toThrow(RangeError);
  });
});
