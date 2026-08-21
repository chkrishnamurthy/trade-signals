import { DIRECTION_META } from '@/lib/dashboard-format';
import type { SignalDirection } from '@/lib/dashboard-types';

export function SignalBadge({
  direction,
  compact = false,
}: {
  direction: SignalDirection;
  compact?: boolean;
}) {
  const meta = DIRECTION_META[direction];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.bg} ${meta.text} ${meta.ring}`}
    >
      <span aria-hidden>{meta.glyph}</span>
      {!compact && meta.label}
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/**
 * Strength meter, 0–100 with 50 as neutral.
 *
 * The numeric value is always rendered alongside the bar, so the meter is not
 * the only carrier of the information.
 */
export function SignalStrength({
  strength,
  direction,
  showValue = true,
  className = '',
}: {
  strength: number;
  direction: SignalDirection;
  showValue?: boolean;
  className?: string;
}) {
  const meta = DIRECTION_META[direction];
  const bullish = strength >= 50;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="img"
        aria-label={`Signal strength ${strength} of 100, ${meta.label}`}
      >
        <div
          className={`h-full rounded-full ${bullish ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${Math.max(2, strength)}%` }}
        />
      </div>
      {showValue && (
        <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
          {strength}%
        </span>
      )}
    </div>
  );
}
