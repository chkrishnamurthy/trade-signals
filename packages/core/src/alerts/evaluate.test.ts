import { describe, expect, it } from 'vitest';
import {
  type AlertCondition,
  type AlertObservation,
  evaluateAlert,
  validateAlertCondition,
} from './evaluate.js';

const day = (
  tradingDate: string,
  closePaise: number | null,
  rsi14: number | null = null,
): AlertObservation => ({ tradingDate, closePaise, rsi14 });

const above1500: AlertCondition = {
  metric: 'close',
  comparator: 'crosses_above',
  threshold: 150000,
};
const below1500: AlertCondition = {
  metric: 'close',
  comparator: 'crosses_below',
  threshold: 150000,
};

describe('evaluateAlert — close crossings', () => {
  it('fires on the session the close moves from at-or-below to above', () => {
    const verdict = evaluateAlert(above1500, day('2026-10-05', 150100), day('2026-10-03', 149900));
    expect(verdict).toEqual({ fired: true, observed: 150100 });
  });

  it('treats a close exactly on the level as not yet across', () => {
    expect(evaluateAlert(above1500, day('2026-10-05', 150000), day('2026-10-03', 149000))).toEqual({
      fired: false,
      reason: 'not_crossed',
    });
    // …and so the next move beyond it is the crossing.
    expect(evaluateAlert(above1500, day('2026-10-06', 150100), day('2026-10-05', 150000))).toEqual({
      fired: true,
      observed: 150100,
    });
  });

  it('does not fire again while the close stays across the level', () => {
    expect(evaluateAlert(above1500, day('2026-10-06', 152000), day('2026-10-05', 150100))).toEqual({
      fired: false,
      reason: 'not_crossed',
    });
  });

  it('fires crossing below', () => {
    expect(evaluateAlert(below1500, day('2026-10-05', 149900), day('2026-10-03', 150000))).toEqual({
      fired: true,
      observed: 149900,
    });
  });

  it('does not fire for a move away from the level in the other direction', () => {
    expect(evaluateAlert(above1500, day('2026-10-05', 140000), day('2026-10-03', 149000))).toEqual({
      fired: false,
      reason: 'not_crossed',
    });
  });
});

describe('evaluateAlert — RSI crossings', () => {
  const rsiAbove70: AlertCondition = {
    metric: 'rsi14',
    comparator: 'crosses_above',
    threshold: 70,
  };
  it('fires when RSI moves above the level', () => {
    expect(evaluateAlert(rsiAbove70, day('d2', 1, 71.2), day('d1', 1, 69.8))).toEqual({
      fired: true,
      observed: 71.2,
    });
  });
  it('ignores the close column', () => {
    expect(evaluateAlert(rsiAbove70, day('d2', 999999, 60), day('d1', 1, 59)).fired).toBe(false);
  });
});

describe('evaluateAlert — missing data', () => {
  it('reports no_data when the current metric is not computed', () => {
    expect(evaluateAlert(above1500, day('d2', null), day('d1', 100))).toEqual({
      fired: false,
      reason: 'no_data',
    });
  });
  it('waits for a previous session rather than firing on creation', () => {
    expect(evaluateAlert(above1500, day('d2', 160000), null)).toEqual({
      fired: false,
      reason: 'no_previous_session',
    });
    expect(evaluateAlert(above1500, day('d2', 160000), day('d1', null))).toEqual({
      fired: false,
      reason: 'no_previous_session',
    });
  });
});

describe('validateAlertCondition', () => {
  it('accepts well-formed rules', () => {
    expect(validateAlertCondition(above1500)).toBeNull();
    expect(
      validateAlertCondition({ metric: 'rsi14', comparator: 'crosses_below', threshold: 30 }),
    ).toBeNull();
  });
  it('rejects fractional or non-positive prices (integer paise)', () => {
    expect(validateAlertCondition({ ...above1500, threshold: 1500.5 })).not.toBeNull();
    expect(validateAlertCondition({ ...above1500, threshold: 0 })).not.toBeNull();
    expect(validateAlertCondition({ ...above1500, threshold: Number.NaN })).not.toBeNull();
  });
  it('rejects RSI levels outside (0, 100)', () => {
    for (const threshold of [0, 100, -5, 150]) {
      expect(
        validateAlertCondition({ metric: 'rsi14', comparator: 'crosses_above', threshold }),
      ).not.toBeNull();
    }
  });
});
