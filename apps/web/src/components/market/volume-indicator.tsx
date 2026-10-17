import { cn } from '@/lib/utils';

/**
 * Relative-volume indicator.
 *
 * Above 1.5× is the threshold the screener treats as unusual, so the label
 * changes there rather than at an arbitrary visual break.
 */
export function VolumeIndicator({
  relativeVolume,
  className,
}: {
  relativeVolume: number | null;
  className?: string | undefined;
}) {
  if (relativeVolume === null || !Number.isFinite(relativeVolume)) {
    return <span className={cn('text-xs text-subtle-foreground', className)}>—</span>;
  }
  const unusual = relativeVolume >= 1.5;
  return (
    <span
      className={cn(
        'figure inline-flex items-center gap-1 text-xs',
        unusual ? 'font-medium text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {relativeVolume.toFixed(2)}×
      {unusual && <span className="text-2xs text-warning-strong">unusual</span>}
    </span>
  );
}
