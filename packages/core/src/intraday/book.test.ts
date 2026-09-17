import { describe, expect, it } from 'vitest';
import { allocateCandidates } from './book.js';

const book = { capitalPaise: 50_000_000, tradesToday: 0, openTrades: 0, dayNetPaise: 0 };
const c = (symbol: string, relativeVolume: number) => ({ symbol, relativeVolume });

describe('allocateCandidates', () => {
  it('takes strongest volume first, symbol A→Z on ties, and is deterministic', () => {
    const out = allocateCandidates(
      [c('ITC', 1.6), c('INFY', 2.1), c('HDFCBANK', 2.1), c('TCS', 1.9)],
      {
        ...book,
        tradesToday: 3,
      },
    );
    expect([...out]).toEqual([
      ['HDFCBANK', null],
      ['INFY', null],
      ['TCS', 'DAILY_LIMIT'],
      ['ITC', 'DAILY_LIMIT'],
    ]);
  });
  it('limits open trades separately from the daily count', () => {
    const out = allocateCandidates([c('A', 2), c('B', 2), c('C', 2)], { ...book, openTrades: 2 });
    expect([...out.values()]).toEqual([null, 'OPEN_LIMIT', 'OPEN_LIMIT']);
  });
  it('halts new trades at −2 % of capital for the day', () => {
    expect([
      ...allocateCandidates([c('A', 2)], { ...book, dayNetPaise: -1_000_000 }).values(),
    ]).toEqual(['LOSS_HALT']);
    expect([
      ...allocateCandidates([c('A', 2)], { ...book, dayNetPaise: -999_999 }).values(),
    ]).toEqual([null]);
  });
});
