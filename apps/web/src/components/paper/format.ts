import {
  formatPaise,
  type PaperOpenTrade,
  type PaperPositionEventKind,
  type PaperReasonCode,
} from '@equitywise/shared';

/**
 * Presentation helpers for the paper-trading page. Every number shown is a
 * stored value; nothing is recomputed here. Vocabulary (CLAUDE.md): BUY/SELL
 * label direction only; levels are technical levels; shares are simulated;
 * the letter R never appears as a unit.
 */
export const time = (at: number | null | undefined) =>
  at === null || at === undefined
    ? '—'
    : new Date(at).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
export const clock = (at: number) =>
  new Date(at).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
export const day = (at: number | null | undefined) =>
  at === null || at === undefined
    ? '—'
    : new Date(at).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
      });
export const price = (p: number | null | undefined) =>
  p === null || p === undefined ? '—' : formatPaise(p);
export const signed = (p: number | null | undefined) =>
  p === null || p === undefined
    ? '—'
    : `${p > 0 ? '+' : p < 0 ? '−' : ''}${formatPaise(Math.abs(p))}`;
export const percent = (net: number | null | undefined, base: number | null | undefined) =>
  net === null || net === undefined || !base
    ? '—'
    : `${net >= 0 ? '+' : '−'}${((Math.abs(net) / base) * 100).toFixed(2)}%`;
export const bps = (points: number) => `${(points / 100).toFixed(points % 100 === 0 ? 0 : 2)}%`;
export const rate = (r: number | null | undefined) =>
  r === null || r === undefined ? '—' : `${(r * 100).toFixed(0)}%`;
export const duration = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined) return '—';
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};
/** "1.3× the amount risked" — never the letter R. */
export const timesRisked = (net: number | null | undefined, risk: number | null | undefined) =>
  net === null || net === undefined || !risk
    ? null
    : `${(net / risk).toFixed(1)}× the amount risked`;

export type Tone = 'bullish' | 'bearish' | 'neutral' | 'warning' | 'secondary' | 'destructive';

export const REASON: Record<PaperReasonCode, string> = {
  INSUFFICIENT_CASH: 'Not enough free virtual cash',
  PORTFOLIO_RISK_LIMIT: 'Portfolio exposure limit',
  DAILY_LOSS_LIMIT: 'Daily loss limit reached',
  DRAWDOWN_LIMIT: 'Drawdown limit reached',
  MAX_POSITIONS: 'Maximum open paper trades',
  MAX_TRADES_PER_DAY: 'Maximum trades for the day',
  STOCK_EXPOSURE_LIMIT: 'Stock exposure limit',
  SECTOR_EXPOSURE_LIMIT: 'Sector exposure limit',
  DUPLICATE_SIGNAL: 'Already taken this session',
  CONFLICTING_SIGNAL: 'Strategies disagreed',
  EXISTING_POSITION: 'Already in this stock',
  STRATEGY_DISABLED: 'Strategy not enabled',
  PAPER_TRADING_DISABLED: 'Paper trading was off',
  ENTRIES_PAUSED: 'Entries were paused',
  SIGNAL_BEFORE_ACTIVATION: 'Signal came before you switched on',
  SIGNAL_EXPIRED: 'Entry window passed',
  MARKET_CLOSED: 'Exchange closed',
  AFTER_ENTRY_CUTOFF: 'After the 14:30 entry cutoff',
  STALE_MARKET_DATA: 'Market data was stale',
  MISSING_CANDLE: 'A candle was missing',
  ENTRY_GAP_TOO_LARGE: 'Next price too far from the signal close',
  INVALID_STOP: 'Stop level not usable',
  QUANTITY_ZERO: 'Limits allowed no shares',
  UNSUPPORTED_ENTRY_KIND: 'Entry rule not supported yet',
  EOD_SQUARE_OFF: 'End-of-day square-off',
  COVERAGE_UNAVAILABLE: 'Price coverage interrupted',
};
export const reasonLabel = (code: string | null) =>
  code === null ? '' : (REASON[code as PaperReasonCode] ?? code.replaceAll('_', ' ').toLowerCase());

export const EVENT: Record<PaperPositionEventKind, string> = {
  OPENED: 'Entered',
  TARGET1_PARTIAL: 'Target 1 reached',
  STOP_UPDATED: 'Stop moved to entry',
  TARGET2: 'Target 2 reached',
  STOP: 'Stop level reached',
  BREAKEVEN_STOP: 'Breakeven stop',
  EOD_SQUARE_OFF: 'Squared off at 15:15',
  COVERAGE_BREAK: 'Coverage interrupted',
  UNRESOLVED: 'Not resolved',
};

export const CAP: Record<string, string> = {
  byRisk: 'the risk budget (1% of equity over the risk distance)',
  byCash: 'free virtual cash (no leverage)',
  byPosition: 'the per-trade exposure cap',
  byStock: 'the per-stock exposure cap',
  bySector: 'the sector exposure cap',
  byPortfolio: 'the portfolio exposure cap',
  charges: 'cash after estimated charges',
};

/** One line for the status column: what the trade is doing now, in plain words. */
export function tradeStatus(t: PaperOpenTrade): { label: string; tone: Tone } {
  const p = t.projection;
  if (t.status === 'CLOSED') {
    if (p.resolution === 'UNAVAILABLE') return { label: 'Unavailable', tone: 'warning' };
    switch (t.exitReason) {
      case 'TARGET2':
        return { label: 'Target 2 hit', tone: 'bullish' };
      case 'STOP':
        return { label: 'Stopped out', tone: 'bearish' };
      case 'BREAKEVEN_STOP':
        return { label: 'Stopped at breakeven', tone: 'neutral' };
      case 'EOD_SQUARE_OFF':
        return { label: 'Squared off', tone: 'neutral' };
      case 'TARGET1_PARTIAL':
        return { label: 'Target 1 hit', tone: 'bullish' };
      default:
        return {
          label: t.openedAt === null ? `Not entered — ${reasonLabel(t.exitReason)}` : 'Closed',
          tone: 'secondary',
        };
    }
  }
  if (p.resolution === 'UNAVAILABLE') return { label: 'Coverage interrupted', tone: 'warning' };
  if (p.fill === null) return { label: 'Waiting for next price', tone: 'secondary' };
  if (t.status === 'EXIT_PENDING') return { label: 'Squaring off', tone: 'warning' };
  if (p.target1At !== null) return { label: 'Target 1 hit · stop at entry', tone: 'bullish' };
  return { label: 'Open', tone: 'neutral' };
}

/** The net figure a row shows: realised for closed trades, marked for open ones. */
export const rowNet = (t: PaperOpenTrade) =>
  t.status === 'CLOSED' ? t.netRealisedPaise : t.markNetPaise;

export const idempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
