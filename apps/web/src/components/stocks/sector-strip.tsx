'use client';

import { PercentChange } from '@/components/market/numeric';
import { Text } from '@/components/ui/typography';
import type { SectorDto } from '@/lib/dashboard-types';
import { toneOf, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Sector summary that is also the sector filter.
 *
 * One control rather than two: a strip that tells you Banking is up 0.84% and
 * then makes you find a separate dropdown to look at the eleven banks has
 * described the market without letting you interrogate it.
 *
 * Deliberately not a reuse of `SectorPerformance` on the dashboard. That is a
 * non-interactive card with its own sort toggle; adding selection to it would
 * compromise a component the dashboard depends on to stay simple.
 *
 * Each chip carries its own number and glyph, so the tone colour is never the
 * only thing distinguishing a strong sector from a weak one.
 */
export function SectorStrip({
  sectors,
  selected,
  onToggle,
  onClear,
  total,
}: {
  /** Already sorted strongest-first by `computeSectors`. */
  sectors: readonly SectorDto[];
  selected: readonly string[];
  onToggle: (sector: string) => void;
  onClear: () => void;
  total: number;
}) {
  if (sectors.length === 0) return null;

  return (
    // A fieldset rather than a div with role="group": these chips are one
    // grouped control, and the native element carries that to assistive tech
    // without an ARIA attribute that can drift out of sync with the markup.
    <fieldset className="flex flex-wrap gap-1.5 border-0 p-0">
      <legend className="sr-only">Filter by sector</legend>
      <Chip active={selected.length === 0} onClick={onClear} label="All sectors" count={total} />
      {sectors.map((sector) => (
        <Chip
          key={sector.name}
          active={selected.includes(sector.name)}
          onClick={() => onToggle(sector.name)}
          label={sector.name}
          count={sector.count}
          changePercent={sector.changePercent}
          advancing={sector.advancing}
        />
      ))}
    </fieldset>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  changePercent,
  advancing,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  changePercent?: number | undefined;
  advancing?: number | undefined;
}) {
  const tone = changePercent === undefined ? 'neutral' : toneOf(changePercent);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group flex min-w-28 flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left ring-1 ring-inset transition-colors',
        active
          ? 'bg-surface-raised ring-border-strong'
          : 'bg-surface-sunken ring-border hover:bg-surface-raised',
      )}
    >
      <span className="flex w-full items-baseline justify-between gap-2">
        <Text
          as="span"
          variant="label"
          className={cn('truncate', active ? 'text-foreground' : 'text-muted-foreground')}
        >
          {label}
        </Text>
        <span className="figure text-[0.6875rem] text-subtle-foreground">{count}</span>
      </span>
      {changePercent === undefined ? (
        <Text as="span" variant="caption">
          Every tracked name
        </Text>
      ) : (
        <span className="flex w-full items-baseline justify-between gap-2">
          <PercentChange value={changePercent} size="xs" />
          {advancing !== undefined && (
            <span className={cn('figure text-[0.6875rem]', toneText({ tone }))}>
              {advancing}/{count} up
            </span>
          )}
        </span>
      )}
    </button>
  );
}
