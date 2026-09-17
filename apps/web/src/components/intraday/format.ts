import {
  formatPaise,
  type IntradaySignalDto,
  type IntradaySkipReason,
  type IntradayStatus,
} from '@equitywise/shared';

/** Presentation helpers. Every number shown is a stored value; nothing is recomputed. */
export const time = (at: number | null) =>
  at === null
    ? '—'
    : new Date(at).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
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
/** "1.3× the amount risked" — the page never shows the letter R. */
export const timesRisked = (net: number | null | undefined, risk: number | null | undefined) =>
  net === null || net === undefined || !risk
    ? null
    : `${(net / risk).toFixed(1)}× the amount risked`;

export type Tone = 'bullish' | 'bearish' | 'neutral' | 'warning' | 'secondary';
export const STATUS: Record<IntradayStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'secondary' },
  ACTIVE: { label: 'Active', tone: 'neutral' },
  TARGET_1_HIT: { label: 'Target 1 hit', tone: 'bullish' },
  TARGET_2_HIT: { label: 'Target 2 hit', tone: 'bullish' },
  STOPPED_OUT: { label: 'Stopped out', tone: 'bearish' },
  CLOSED_EOD: { label: 'Closed EOD', tone: 'neutral' },
  SKIPPED: { label: 'Skipped', tone: 'secondary' },
};
export const SKIP: Record<IntradaySkipReason, string> = {
  ENTRY_SLIPPED: 'entry slipped',
  DAILY_LIMIT: 'daily limit',
  OPEN_LIMIT: 'open-trade limit',
  LOSS_HALT: 'daily loss halt',
  TOO_EXPENSIVE: 'too expensive',
};
export const EXIT: Record<string, string> = {
  TARGET_1: 'Target 1',
  TARGET_2: 'Target 2',
  STOP: 'Stop',
  BREAKEVEN_STOP: 'Breakeven stop',
  EOD: 'End of day',
};
export function statusOf(s: IntradaySignalDto): { label: string; tone: Tone } {
  const p = s.projection;
  if (p.resolution === 'UNAVAILABLE') return { label: 'Unavailable', tone: 'warning' };
  const base = STATUS[p.status];
  if (p.status === 'STOPPED_OUT' && p.exits.at(-1)?.reason === 'BREAKEVEN_STOP')
    return { label: 'Stopped at breakeven', tone: 'neutral' };
  return base;
}
export function notTakenLabel(s: IntradaySignalDto): string | null {
  const p = s.projection;
  if (p.taken || p.status === 'SKIPPED' || p.skipReason === null) return null;
  return `Not taken — ${SKIP[p.skipReason]}`;
}
export function exitSummary(s: IntradaySignalDto): string {
  return s.projection.exits.map((x) => EXIT[x.reason] ?? x.reason).join(' → ') || '—';
}
export const isNew = (s: IntradaySignalDto, serverNow: number) =>
  serverNow - s.publishedAt <= 5 * 60_000;
