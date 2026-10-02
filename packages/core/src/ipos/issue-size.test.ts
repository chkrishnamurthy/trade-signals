import { describe, expect, it } from 'vitest';
import { parseIssueSize } from './issue-size.js';

// The first four sentences are verbatim from NSE detail payloads (2026-10-02);
// the expected values are read off the sentence by hand.

describe('parseIssueSize', () => {
  it('reads a fresh amount in lakhs and an OFS share count (VNL)', () => {
    const parsed = parseIssueSize(
      '"Initial Public Offering comprising fresh issue aggregating up to 14500 lakhs and offer for sale up to 15,00,000 Equity Shares"',
    );
    expect(parsed.fresh).toEqual({ paise: 145_000_000_000, shares: null });
    expect(parsed.offerForSale).toEqual({ paise: null, shares: 1_500_000 });
    expect(parsed.total).toBeNull();
  });

  it('reads both amounts plus the employee and anchor asides (AONESTEELS)', () => {
    const parsed = parseIssueSize(
      '"Initial public offer comprising Fresh Issue aggregating up to Rs. 35,500 Lakhs and Offer for Sale aggregating up to Rs. 5,000 Lakhs (Including Employee Reservation Portion aggregating up to Rs. 200 lakhs and Anchor portion of 29,85,160 Equity Shares)"',
    );
    // ₹35,500 lakh = 3,550,000,000 rupees = 355,000,000,000 paise.
    expect(parsed.fresh).toEqual({ paise: 355_000_000_000, shares: null });
    expect(parsed.offerForSale).toEqual({ paise: 50_000_000_000, shares: null });
    expect(parsed.employeeReservation).toEqual({ paise: 2_000_000_000, shares: null });
    expect(parsed.anchorShares).toBe(2_985_160);
  });

  it('reads a share count written before the word "fresh" (RKFAL, SME)', () => {
    const parsed = parseIssueSize(
      '"Initial Public Offering of upto 42,67,200 fresh equity shares (Including market maker portion of 2,14,400 equity shares)"',
    );
    expect(parsed.fresh).toEqual({ paise: null, shares: 4_267_200 });
    expect(parsed.offerForSale).toBeNull();
    expect(parsed.marketMakerShares).toBe(214_400);
  });

  it('reads an unbalanced "and (Including …)" phrasing (EVENTIONS, SME)', () => {
    const parsed = parseIssueSize(
      '"Initial Public Offer comprising of Fresh Issue up to 32,30,400 Equity Shares and (Including Market Maker portion of 1,62,000 Equity Shares)"',
    );
    expect(parsed.fresh).toEqual({ paise: null, shares: 3_230_400 });
    expect(parsed.marketMakerShares).toBe(162_000);
  });

  it('reads amounts stated in millions (ORIENTCABL, 2026-10-02)', () => {
    const parsed = parseIssueSize(
      'Initial Public offer comprising of Fresh issue aggregating up to Rs. 3,200 million and Offer for Sale aggregating up to Rs. 2,320 million (including Anchor investor portion of 60,88,233 Equity shares)',
    );
    // 3,200 million rupees = 3,200,000,000 rupees = 320,000,000,000 paise (₹320 crore).
    expect(parsed.fresh).toEqual({ paise: 320_000_000_000, shares: null });
    // 2,320 million rupees = 232,000,000,000 paise (₹232 crore).
    expect(parsed.offerForSale).toEqual({ paise: 232_000_000_000, shares: null });
    expect(parsed.anchorShares).toBe(6_088_233);
  });

  it('reads a large fresh issue in millions (ELEVATE, 2026-10-02)', () => {
    const parsed = parseIssueSize(
      'Initial Public offer comprising of Fresh issue aggregating up to Rs. 21,000 million (Including Anchor reservation portion of 2,61,04,972 equity shares)',
    );
    // 21,000 million rupees = ₹2,100 crore = 2,100,000,000,000 paise.
    expect(parsed.fresh).toEqual({ paise: 2_100_000_000_000, shares: null });
    expect(parsed.anchorShares).toBe(26_104_972);
  });

  it('keeps a million-denominated share count a count', () => {
    expect(parseIssueSize('Fresh issue of 1.5 million equity shares').fresh).toEqual({
      paise: null,
      shares: 1_500_000,
    });
  });

  it('reads crore amounts and an OFS-only issue', () => {
    const parsed = parseIssueSize(
      'Offer for sale of up to 1,20,00,000 equity shares aggregating up to ₹1,250 crore',
    );
    expect(parsed.fresh).toBeNull();
    expect(parsed.offerForSale).toEqual({ paise: null, shares: 12_000_000 });
  });

  it('keeps a lakh-denominated share count a count, not money', () => {
    const parsed = parseIssueSize('Fresh issue of 1.2 lakh equity shares');
    expect(parsed.fresh).toEqual({ paise: null, shares: 120_000 });
  });

  it('falls back to a total when no component word is present', () => {
    const parsed = parseIssueSize('Public issue aggregating up to Rs. 500 crore');
    // ₹500 crore = 5,000,000,000 rupees = 500,000,000,000 paise.
    expect(parsed.total).toEqual({ paise: 500_000_000_000, shares: null });
  });

  it('returns all-null for empty or unreadable text', () => {
    expect(parseIssueSize(null).fresh).toBeNull();
    expect(parseIssueSize('To be announced').total).toBeNull();
  });
});
