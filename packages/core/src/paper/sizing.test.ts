import { describe, expect, it } from 'vitest';
import { PAPER_DEFAULT_LIMITS } from './config.js';
import { CAPITAL, intent, relianceIntent } from './fixture.js';
import { sizePaperEntry } from './sizing.js';
import { emptyPortfolioState } from './state.js';

/**
 * ₹2,00,000 book, defaults, RELIANCE ref 2956.40 stop 2934.50 (risk 21.90):
 *   risk budget 1 % = 200,000 → byRisk floor(200000/2190) = 91
 *   byCash floor(20,000,000/295,640) = 67
 *   byPosition 35 % = 7,000,000 → 23 ; byStock 23 ; bySector 60 % = 12,000,000 → 40 ; byPortfolio 100 % → 67
 *   shares = 23 (position cap binds first)
 *   reserve(23) = 23×295640 = 6,799,720 + slip ceil(6,799,720×30/10000 = 20,399.16) = 20,400
 *     + charges(295640,295640,23): broker 2000+2000, exch ceil(417.49)=418, reg 14, prot 1 → taxable 4433,
 *       GST ceil(797.94)=798, STT ceil(1699.93)=1700, stamp ceil(203.99)=204 → 7,135
 *     = 6,827,255
 */
describe('sizePaperEntry', () => {
  it('sizes the worked example against a ₹2,00,000 book', () => {
    const s = sizePaperEntry(relianceIntent(), emptyPortfolioState(CAPITAL), PAPER_DEFAULT_LIMITS);
    expect(s).toEqual({
      equityPaise: 20_000_000,
      availableCashPaise: 20_000_000,
      riskBudgetPaise: 200_000,
      perShareRiskPaise: 2_190,
      plannedEntryPaise: 295_640,
      caps: { byRisk: 91, byCash: 67, byPosition: 23, byStock: 23, bySector: 40, byPortfolio: 67 },
      bindingCap: 'byPosition',
      shares: 23,
      reservePaise: 6_827_255,
    });
  });
  it('the risk budget binds on a wide stop', () => {
    // stop 2900.00: risk 5640 → byRisk floor(200000/5640) = 35 > 23, so position still binds;
    // stop 2800.00: risk 15640 → byRisk 12 < 23 → risk binds.
    const s = sizePaperEntry(
      intent({ id: 2, stop: 280_000 }),
      emptyPortfolioState(CAPITAL),
      PAPER_DEFAULT_LIMITS,
    );
    expect(s.caps.byRisk).toBe(12);
    expect(s).toMatchObject({ shares: 12, bindingCap: 'byRisk' });
  });
  it('existing exposure reduces the stock, sector and portfolio room', () => {
    const state = {
      ...emptyPortfolioState(CAPITAL),
      exposureByInstrument: new Map([[101, 6_000_000]]),
      exposureBySector: new Map([['Energy', 11_000_000]]),
      totalExposurePaise: 19_000_000,
    };
    const s = sizePaperEntry(relianceIntent(), state, PAPER_DEFAULT_LIMITS);
    // byStock floor((7,000,000 − 6,000,000)/295640) = 3; bySector floor(1,000,000/295640) = 3; byPortfolio 3
    expect(s.caps).toMatchObject({ byStock: 3, bySector: 3, byPortfolio: 3 });
    expect(s).toMatchObject({ shares: 3, bindingCap: 'byStock' });
  });
  it('reduces shares until the reservation, with charges, fits the free cash', () => {
    // 3 shares cost 886,920 + slip 2,661 + charges; with 890,000 free only 2 fit.
    const s = sizePaperEntry(
      relianceIntent(),
      { ...emptyPortfolioState(CAPITAL), cashPaise: 890_000 },
      PAPER_DEFAULT_LIMITS,
    );
    expect(s.caps.byCash).toBe(3);
    expect(s).toMatchObject({ shares: 2, bindingCap: 'charges' });
    expect(
      sizePaperEntry(
        relianceIntent(),
        { ...emptyPortfolioState(CAPITAL), cashPaise: 0 },
        PAPER_DEFAULT_LIMITS,
      ),
    ).toMatchObject({ shares: 0, bindingCap: 'byCash', reservePaise: 0 });
  });
});
