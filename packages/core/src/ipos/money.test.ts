import { describe, expect, it } from 'vitest';
import { parseIssueSize } from './issue-size.js';
import {
  gmpPercent,
  investmentLimits,
  issueSizePaise,
  maxRetailLots,
  minApplicationLots,
  minApplicationShares,
  minInvestmentPaise,
  percentChange,
  smeInvestmentLimits,
  subscriptionTimes,
} from './money.js';

describe('minInvestmentPaise', () => {
  it('is one lot at the upper band (VNL: 68 × ₹220 = ₹14,960)', () => {
    expect(
      minInvestmentPaise({
        lotSize: 68,
        minBidQuantity: 68,
        priceBandHighPaise: 22_000,
        issuePricePaise: null,
      }),
    ).toBe(1_496_000);
  });
  it('uses the minimum order quantity when it differs from the lot', () => {
    // SME: lot 1,200, minimum 2,400 shares at ₹118 = ₹2,83,200.
    expect(
      minInvestmentPaise({
        lotSize: 1_200,
        minBidQuantity: 2_400,
        priceBandHighPaise: 11_800,
        issuePricePaise: null,
      }),
    ).toBe(28_320_000);
  });
  it('falls back to the issue price for a fixed-price issue', () => {
    expect(
      minInvestmentPaise({
        lotSize: 3_000,
        minBidQuantity: null,
        priceBandHighPaise: null,
        issuePricePaise: 4_000,
      }),
    ).toBe(12_000_000);
  });
  it('is null when the lot or price is unknown', () => {
    expect(
      minInvestmentPaise({
        lotSize: null,
        minBidQuantity: null,
        priceBandHighPaise: 22_000,
        issuePricePaise: null,
      }),
    ).toBeNull();
  });
});

describe('maxRetailLots', () => {
  it('fits whole lots under ₹2,00,000', () => {
    // One lot of 68 × ₹220 = ₹14,960; ₹2,00,000 / ₹14,960 = 13.37 → 13 lots.
    expect(
      maxRetailLots({ lotSize: 68, priceBandHighPaise: 22_000, issuePricePaise: null }, 20_000_000),
    ).toBe(13);
  });
  it('is null without a cap', () => {
    expect(
      maxRetailLots({ lotSize: 68, priceBandHighPaise: 22_000, issuePricePaise: null }, null),
    ).toBeNull();
  });
});

describe('issueSizePaise', () => {
  it('adds official amounts (AONESTEELS: ₹355 cr + ₹50 cr = ₹405 cr)', () => {
    const parsed = parseIssueSize(
      'Fresh Issue aggregating up to Rs. 35,500 Lakhs and Offer for Sale aggregating up to Rs. 5,000 Lakhs',
    );
    expect(issueSizePaise(parsed, 40_500)).toEqual({
      totalPaise: 405_000_000_000,
      basis: 'official',
      freshPaise: 355_000_000_000,
      offerForSalePaise: 50_000_000_000,
    });
  });
  it('prices an OFS share count at the upper band and says so (VNL)', () => {
    const parsed = parseIssueSize(
      'fresh issue aggregating up to 14500 lakhs and offer for sale up to 15,00,000 Equity Shares',
    );
    // OFS 15,00,000 × ₹220 = ₹33 cr = 33,000,000,000 paise; fresh ₹145 cr.
    expect(issueSizePaise(parsed, 22_000)).toEqual({
      totalPaise: 178_000_000_000,
      basis: 'derived_at_upper_band',
      freshPaise: 145_000_000_000,
      offerForSalePaise: 33_000_000_000,
    });
  });
  it('is null when a share-only component has no band to price it', () => {
    const parsed = parseIssueSize('Fresh Issue up to 32,30,400 Equity Shares');
    expect(issueSizePaise(parsed, null)).toBeNull();
  });
});

describe('ratios', () => {
  it('subscriptionTimes divides bids by offered and never divides by zero', () => {
    expect(subscriptionTimes(4_835_208, 8_471_153)).toBeCloseTo(0.5708, 4);
    expect(subscriptionTimes(4_240_800, 0)).toBeNull();
    expect(subscriptionTimes(null, 100)).toBeNull();
  });
  it('percentChange is listing gain from paise (₹405 → ₹455 = +12.35%)', () => {
    expect(percentChange(40_500, 45_500)).toBeCloseTo(12.3457, 3);
    expect(percentChange(3_400, 5_500)).toBeCloseTo(61.7647, 3);
    expect(percentChange(0, 100)).toBeNull();
  });
  it('gmpPercent handles a discount', () => {
    // ₹20 on ₹220 = 9.09%; −₹5 on ₹305 = −1.64%.
    expect(gmpPercent(2_000, 22_000)).toBeCloseTo(9.0909, 3);
    expect(gmpPercent(-500, 30_500)).toBeCloseTo(-1.6393, 3);
    expect(gmpPercent(null, 30_500)).toBeNull();
  });
});

describe('investmentLimits', () => {
  it('sizes each category in whole lots at the upper band (VNL: 68 shares at ₹220)', () => {
    // One lot = ₹14,960. Retail: 13 lots (₹1,94,480) fit under ₹2 lakh; small
    // NII runs from 14 lots (₹2,09,440) to 66 (₹9,87,360); big NII from 67.
    expect(
      investmentLimits({ lotSize: 68, priceBandHighPaise: 22_000, issuePricePaise: null }),
    ).toEqual([
      { kind: 'retail_min', lots: 1, shares: 68, amountPaise: 1_496_000 },
      { kind: 'retail_max', lots: 13, shares: 884, amountPaise: 19_448_000 },
      { kind: 'snii_min', lots: 14, shares: 952, amountPaise: 20_944_000 },
      { kind: 'snii_max', lots: 66, shares: 4_488, amountPaise: 98_736_000 },
      { kind: 'bnii_min', lots: 67, shares: 4_556, amountPaise: 100_232_000 },
    ]);
  });
  it("uses the source's retail cap when it states one", () => {
    // 100 shares at ₹150 = ₹15,000 a lot; a ₹1,50,000 cap fits exactly 10.
    const limits = investmentLimits(
      { lotSize: 100, priceBandHighPaise: 15_000, issuePricePaise: null },
      15_000_000,
    );
    expect(limits.find((l) => l.kind === 'retail_max')?.lots).toBe(10);
    expect(limits.find((l) => l.kind === 'snii_min')?.amountPaise).toBe(16_500_000);
  });
  it('is empty without a lot or a price, or when one lot exceeds the retail cap', () => {
    expect(
      investmentLimits({ lotSize: null, priceBandHighPaise: 22_000, issuePricePaise: null }),
    ).toEqual([]);
    expect(
      investmentLimits({ lotSize: 68, priceBandHighPaise: null, issuePricePaise: null }),
    ).toEqual([]);
    // SME-sized lot: 2,400 × ₹118 = ₹2,83,200, above the retail cap.
    expect(
      investmentLimits({ lotSize: 2_400, priceBandHighPaise: 11_800, issuePricePaise: null }),
    ).toEqual([]);
  });
});

describe('minApplicationLots', () => {
  it('is one lot on the mainboard', () => {
    expect(minApplicationLots('mainboard', '2026-09-30')).toBe(1);
  });
  it('is two lots on SME from 3 March 2025, one lot before', () => {
    expect(minApplicationLots('sme', '2026-09-30')).toBe(2);
    expect(minApplicationLots('sme', '2025-03-03')).toBe(2);
    expect(minApplicationLots('sme', '2025-03-02')).toBe(1);
  });
  it('assumes the current rule for an SME issue with no dates yet', () => {
    expect(minApplicationLots('sme', null)).toBe(2);
  });
});

describe('minInvestmentPaise with minLots', () => {
  it('prices two lots for an SME issue (EVENTIONS: 2 × 1,200 × ₹118 = ₹2,83,200)', () => {
    expect(
      minInvestmentPaise({
        lotSize: 1_200,
        minBidQuantity: null,
        priceBandHighPaise: 11_800,
        issuePricePaise: null,
        minLots: 2,
      }),
    ).toBe(28_320_000);
    expect(minApplicationShares({ lotSize: 1_200, minBidQuantity: null, minLots: 2 })).toBe(2_400);
  });
  it('lets a stated minimum quantity win over the lot rule', () => {
    expect(minApplicationShares({ lotSize: 1_200, minBidQuantity: 1_200, minLots: 2 })).toBe(1_200);
  });
});

describe('smeInvestmentLimits', () => {
  it('splits EVENTIONS (1,200 × ₹118 = ₹1,41,600 a lot) into individual, sNII and bNII', () => {
    // Hand-computed: 2 lots = ₹2,83,200; sNII from 3 lots (₹4,24,800) to
    // floor(₹10,00,000 / ₹1,41,600) = 7 lots (₹9,91,200); bNII from 8 lots (₹11,32,800).
    expect(
      smeInvestmentLimits({ lotSize: 1_200, priceBandHighPaise: 11_800, issuePricePaise: null }),
    ).toEqual([
      { kind: 'individual', lots: 2, shares: 2_400, amountPaise: 28_320_000 },
      { kind: 'snii_min', lots: 3, shares: 3_600, amountPaise: 42_480_000 },
      { kind: 'snii_max', lots: 7, shares: 8_400, amountPaise: 99_120_000 },
      { kind: 'bnii_min', lots: 8, shares: 9_600, amountPaise: 113_280_000 },
    ]);
  });
  it('starts small NII above ₹2 lakh when three lots would not reach it', () => {
    // 1,000 × ₹50 = ₹50,000 a lot: 3 lots is only ₹1,50,000, so sNII starts at 5 lots (₹2,50,000).
    const limits = smeInvestmentLimits({
      lotSize: 1_000,
      priceBandHighPaise: 5_000,
      issuePricePaise: null,
    });
    expect(limits.find((l) => l.kind === 'snii_min')).toMatchObject({ lots: 5 });
    expect(limits.find((l) => l.kind === 'snii_max')).toMatchObject({ lots: 20 });
    expect(limits.find((l) => l.kind === 'bnii_min')).toMatchObject({ lots: 21 });
  });
  it('is empty without a lot or a price', () => {
    expect(
      smeInvestmentLimits({ lotSize: null, priceBandHighPaise: 11_800, issuePricePaise: null }),
    ).toEqual([]);
  });
});
