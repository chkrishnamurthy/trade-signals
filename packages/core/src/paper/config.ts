import type { PaperLimits } from '@equitywise/shared';

/**
 * Portfolio defaults (docs/planning/paper-trading-plan.md §11). Users may
 * tighten within the bounds `paperLimitsSchema` enforces; the engine reads the
 * portfolio's own settings, never these constants, once a portfolio exists.
 */
export const PAPER_DEFAULT_LIMITS: PaperLimits = Object.freeze({
  riskBps: 100,
  maxOpenPositions: 3,
  maxTradesPerDay: 5,
  maxPositionExposureBps: 3500,
  maxPortfolioExposureBps: 10000,
  maxStockExposureBps: 3500,
  maxSectorExposureBps: 6000,
  dailyLossHaltBps: 200,
  maxDrawdownHaltBps: 1000,
});
/** ₹2,00,000 — the product decision. */
export const PAPER_STARTING_CAPITAL_PAISE = 20_000_000;
/** Bumps when a decision rule changes; stored on every order. */
export const PAPER_ENGINE_REVISION = 1;
/** Sample-size thresholds for performance figures (§14). */
export const PAPER_SAMPLE_TOO_FEW = 30;
export const PAPER_SAMPLE_EARLY = 100;
