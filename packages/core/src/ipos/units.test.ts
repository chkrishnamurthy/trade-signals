import { describe, expect, it } from 'vitest';
import {
  cleanText,
  parseCount,
  parseDdMonYyyy,
  parseDecimal,
  parseIsoDateKey,
  parseIstDayTime,
  parsePriceBand,
  parseRupeeAmount,
  parseShareQuantity,
  scaledRupeesToPaise,
  signedRupeeTextToPaise,
  stripHtml,
} from './units.js';

// Every expected value below is worked out by hand, never from the code.

describe('parseDdMonYyyy', () => {
  it('reads both casings NSE uses', () => {
    expect(parseDdMonYyyy('05-Oct-2026')).toBe('2026-10-05');
    expect(parseDdMonYyyy('01-OCT-2026')).toBe('2026-10-01');
    expect(parseDdMonYyyy(' 6-Sept-2012 ')).toBe('2012-09-06');
  });
  it('rejects impossible and malformed dates', () => {
    expect(parseDdMonYyyy('31-Feb-2026')).toBeNull();
    expect(parseDdMonYyyy('29-Feb-2028')).toBe('2028-02-29');
    expect(parseDdMonYyyy('-')).toBeNull();
    expect(parseDdMonYyyy('05-Okt-2026')).toBeNull();
    expect(parseDdMonYyyy('2026-10-05')).toBeNull();
  });
});

describe('parseIsoDateKey', () => {
  it('accepts real keys only', () => {
    expect(parseIsoDateKey('2026-09-30')).toBe('2026-09-30');
    expect(parseIsoDateKey('2026-02-30')).toBeNull();
    expect(parseIsoDateKey('30-09-2026')).toBeNull();
  });
});

describe('parseIstDayTime', () => {
  it('converts an IST wall-clock time to UTC', () => {
    // 17:00 IST = 11:30 UTC.
    expect(parseIstDayTime('Updated as on 01-Oct-2026 17:00:00')?.toISOString()).toBe(
      '2026-10-01T11:30:00.000Z',
    );
  });
  it('handles midnight IST, which is the previous UTC day', () => {
    expect(parseIstDayTime('02-Oct-2026 00:15')?.toISOString()).toBe('2026-10-01T18:45:00.000Z');
  });
  it('is null for the source writing "null"', () => {
    expect(parseIstDayTime('Updated as on null')).toBeNull();
  });
});

describe('parseCount', () => {
  it('reads Indian grouping and the exchange float strings', () => {
    expect(parseCount('15,00,000')).toBe(1_500_000);
    expect(parseCount('8471153.0')).toBe(8_471_153);
    expect(parseCount('1.4456E7')).toBe(14_456_000);
    expect(parseCount(37)).toBe(37);
  });
  it('is null for blanks, dashes and fractional counts', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount('-')).toBeNull();
    expect(parseCount('NA')).toBeNull();
    expect(parseCount('12.5')).toBeNull();
    expect(parseCount('-4')).toBeNull();
    expect(parseCount(null)).toBeNull();
  });
});

describe('parseDecimal', () => {
  it('reads ratios and signed percentages', () => {
    expect(parseDecimal('0.4393630949647586')).toBeCloseTo(0.43936, 5);
    expect(parseDecimal('-1.64')).toBe(-1.64);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });
});

describe('money text → paise', () => {
  it('parseRupeeAmount reads amounts at the start of a phrase', () => {
    expect(parseRupeeAmount('"Rs. 2,00,000"')).toBe(20_000_000);
    expect(parseRupeeAmount('Rs. 10 per Equity Share')).toBe(1_000);
    expect(parseRupeeAmount('Rs.10 per Equity Share')).toBe(1_000);
    expect(parseRupeeAmount('   405')).toBe(40_500);
    expect(parseRupeeAmount('₹405.50')).toBe(40_550);
    expect(
      parseRupeeAmount(
        'Rs. 38 per Equity Share is being offered to Eligible Employees bidding in the Employee Reservation Portion',
      ),
    ).toBe(3_800);
    expect(parseRupeeAmount('NA')).toBeNull();
    expect(parseRupeeAmount('-')).toBeNull();
    expect(parseRupeeAmount(null)).toBeNull();
  });

  it('scaledRupeesToPaise uses integer arithmetic for lakh, crore, million and billion', () => {
    // 14,500 lakh rupees = ₹1,45,00,00,000 = 145,000,000,000 paise.
    expect(scaledRupeesToPaise('14500', 'lakhs')).toBe(145_000_000_000);
    // ₹35,500.50 lakh = ₹3,55,00,50,000 → ×100 paise.
    expect(scaledRupeesToPaise('35,500.50', 'Lakhs')).toBe(355_005_000_000);
    // ₹1,250 crore = ₹12,50,00,00,000.
    expect(scaledRupeesToPaise('1,250', 'crore')).toBe(1_250_000_000_000);
    expect(scaledRupeesToPaise('405', null)).toBe(40_500);
    // NSE states some issue sizes in millions: 3,200 million rupees = ₹320 crore.
    expect(scaledRupeesToPaise('3,200', 'million')).toBe(320_000_000_000);
    // 1.5 billion rupees = ₹150 crore.
    expect(scaledRupeesToPaise('1.5', 'billion')).toBe(150_000_000_000);
    expect(scaledRupeesToPaise('405', 'thousand')).toBeNull();
  });

  it('signedRupeeTextToPaise keeps a discount negative', () => {
    expect(signedRupeeTextToPaise('-5')).toBe(-500);
    expect(signedRupeeTextToPaise('13.5')).toBe(1_350);
    expect(signedRupeeTextToPaise('0.7')).toBe(70);
    expect(signedRupeeTextToPaise('-0')).toBe(0);
    expect(signedRupeeTextToPaise('--')).toBeNull();
  });
});

describe('parsePriceBand', () => {
  it('reads every band form seen at NSE', () => {
    expect(parsePriceBand('Rs.208 to Rs.220')).toEqual({ lowPaise: 20_800, highPaise: 22_000 });
    expect(parsePriceBand('Rs. 385 to Rs. 405 per Equity Share')).toEqual({
      lowPaise: 38_500,
      highPaise: 40_500,
    });
    expect(parsePriceBand('Rs.77 to Rs.82 per equity share')).toEqual({
      lowPaise: 7_700,
      highPaise: 8_200,
    });
    expect(parsePriceBand('₹98-103')).toEqual({ lowPaise: 9_800, highPaise: 10_300 });
    // NITYAS, verbatim: the "/-" rupee suffix on both ends.
    expect(parsePriceBand('Rs. 70/- to Rs. 75/-per equity share ')).toEqual({
      lowPaise: 7_000,
      highPaise: 7_500,
    });
  });
  it('reads a fixed price as a one-point band', () => {
    expect(parsePriceBand('Rs.1000')).toEqual({ lowPaise: 100_000, highPaise: 100_000 });
    expect(parsePriceBand('402')).toEqual({ lowPaise: 40_200, highPaise: 40_200 });
  });
  it('rejects nonsense', () => {
    expect(parsePriceBand('-')).toBeNull();
    expect(parsePriceBand('Rs.220 to Rs.208')).toBeNull();
    expect(parsePriceBand('Rs.0')).toBeNull();
    expect(parsePriceBand('To be announced')).toBeNull();
    expect(parsePriceBand(undefined)).toBeNull();
  });
});

describe('parseShareQuantity', () => {
  it('reads the lot phrasings', () => {
    expect(parseShareQuantity('68 Equity Shares and in multiples thereof')).toBe(68);
    // ARDEE (Aug 2026): the lot written as a minimum.
    expect(parseShareQuantity('Minimum 281 Equity shares and in multiples thereof')).toBe(281);
    expect(parseShareQuantity('Minimum of 1,200 Equity Shares')).toBe(1_200);
    expect(parseShareQuantity('1600 Equity Shares')).toBe(1_600);
    expect(parseShareQuantity('37 Equity shares and in multiples thereof')).toBe(37);
    expect(parseShareQuantity('1,200 shares')).toBe(1_200);
  });
  it('is null when the text does not start with a count', () => {
    expect(parseShareQuantity('In multiples of 68')).toBeNull();
    expect(parseShareQuantity('0 Equity Shares')).toBeNull();
  });
});

describe('text cleaning', () => {
  it('cleanText strips quotes and null words', () => {
    expect(cleanText('"Rs. 2,00,000"')).toBe('Rs. 2,00,000');
    expect(cleanText('  MUFG Intime India Private Limited  ')).toBe(
      'MUFG Intime India Private Limited',
    );
    expect(cleanText('NA')).toBeNull();
    expect(cleanText('')).toBeNull();
  });
  it('stripHtml removes tags and decodes entities', () => {
    expect(stripHtml('&#8377;<b>20</b> (9.09%)')).toBe('₹ 20 (9.09%)');
    expect(stripHtml('<a href=x target=new>SCSB List</a>')).toBe('SCSB List');
    expect(stripHtml('Nityas Gems &amp; Jewellery')).toBe('Nityas Gems & Jewellery');
  });
  it('stripHtml decodes in one pass and never throws on a bad entity', () => {
    // `&amp;lt;` is the text "&lt;", not a tag.
    expect(stripHtml('a &amp;lt;b&amp;gt; c')).toBe('a &lt;b&gt; c');
    expect(stripHtml('&#x20B9;405 &QUOT;x&quot; &apos;y&#39;')).toBe('₹405 "x" \'y\'');
    // Past U+10FFFF, a surrogate, or zero: kept as written.
    expect(stripHtml('x &#99999999; y')).toBe('x &#99999999; y');
    expect(stripHtml('&#xD800;&#0;')).toBe('&#xD800;&#0;');
    expect(stripHtml('&unknown; stays')).toBe('&unknown; stays');
  });
});
