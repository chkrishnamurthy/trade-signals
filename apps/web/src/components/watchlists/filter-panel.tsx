'use client';

import { FilterIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Text } from '@/components/ui/typography';
import { getColumn } from '@/lib/watchlist-columns';
import {
  countActiveFilters,
  isFlagAvailable,
  isRangeActive,
  setRange,
  toggleFacet,
  WATCHLIST_FLAGS,
} from '@/lib/watchlist-filters';
import type { WatchlistFilterStateDto } from '@/lib/watchlist-types';

/**
 * The filters popover.
 *
 * Range inputs are keyed by column id and read their label and unit from the
 * registry, so the set below is a list of ids rather than a hand-written form.
 * Adding a filterable column is a one-line change here and none at all in the
 * filtering logic.
 *
 * Ranges are typed in DISPLAY units — rupees for a price, plain numbers for a
 * ratio — and converted to paise on the way into state. A user typing "2500"
 * into a price filter means ₹2,500, and making them type 250000 would be the
 * internal representation leaking into the interface.
 */

/** Numeric columns worth a range control, in the order they appear. */
const RANGE_COLUMNS: readonly string[] = [
  'ltp',
  'changePercent',
  'volume',
  'relativeVolume',
  'rsi14',
  'atrPercent',
  'from52wHigh',
  'return1m',
  'return1y',
  'signalStrength',
  'turnover',
  'marketCap',
  'peRatio',
  'dividendYield',
];

const DIRECTIONS = [
  { value: 'all', label: 'All' },
  { value: 'advancing', label: 'Advancing' },
  { value: 'declining', label: 'Declining' },
  { value: 'unchanged', label: 'Unchanged' },
] as const;

/** Paise columns are entered in rupees; everything else is entered as-is. */
function toStored(columnId: string, entered: number): number {
  return getColumn(columnId)?.unit === 'paise' ? Math.round(entered * 100) : entered;
}

function toDisplay(columnId: string, stored: number): number {
  return getColumn(columnId)?.unit === 'paise' ? stored / 100 : stored;
}

function unitHint(columnId: string): string {
  switch (getColumn(columnId)?.unit) {
    case 'paise':
      return '₹';
    case 'percent':
      return '%';
    case 'ratio':
      return '×';
    case 'shares':
      return 'shares';
    default:
      return '';
  }
}

export function FilterPanel({
  filters,
  sectors,
  exchanges,
  onChange,
  onClear,
}: {
  filters: WatchlistFilterStateDto;
  sectors: readonly string[];
  exchanges: readonly string[];
  onChange: (next: WatchlistFilterStateDto) => void;
  onClear: () => void;
}) {
  const active = countActiveFilters(filters);

  const flags = useMemo(
    () => WATCHLIST_FLAGS.map((flag) => ({ flag, available: isFlagAvailable(flag) })),
    [],
  );

  const selectedFlags = new Set(filters.flags ?? []);
  const selectedSectors = new Set(filters.sectors ?? []);
  const selectedExchanges = new Set(filters.exchanges ?? []);

  const bound = (columnId: string, edge: 'min' | 'max'): string => {
    const stored = filters.ranges?.[columnId]?.[edge];
    return stored === null || stored === undefined ? '' : String(toDisplay(columnId, stored));
  };

  const editBound = (columnId: string, edge: 'min' | 'max', raw: string): void => {
    const current = filters.ranges?.[columnId] ?? { min: null, max: null };
    const parsed = raw.trim() === '' ? null : Number(raw);
    // A half-typed "-" or "1e" must not wipe the other bound.
    if (parsed !== null && !Number.isFinite(parsed)) return;
    onChange(
      setRange(filters, columnId, {
        ...current,
        [edge]: parsed === null ? null : toStored(columnId, parsed),
      }),
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <FilterIcon />
          Filters
          {active > 0 && (
            <Badge variant="default" size="sm">
              {active}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <Text variant="label">Filters</Text>
          <Button variant="ghost" size="sm" disabled={active === 0} onClick={onClear}>
            Clear all
          </Button>
        </div>
        <Separator />

        <ScrollArea className="max-h-[min(30rem,70vh)]">
          <div className="flex flex-col gap-4 p-3">
            {/* Direction */}
            <div className="flex flex-col gap-1.5">
              <Text variant="label" className="text-muted-foreground">
                Direction
              </Text>
              <ToggleGroup
                type="single"
                value={filters.direction ?? 'all'}
                onValueChange={(value) =>
                  onChange({
                    ...filters,
                    direction: (value === ''
                      ? 'all'
                      : value) as WatchlistFilterStateDto['direction'],
                  })
                }
              >
                {DIRECTIONS.map((direction) => (
                  <ToggleGroupItem key={direction.value} value={direction.value}>
                    {direction.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {/* Ranges */}
            <div className="flex flex-col gap-2">
              <Text variant="label" className="text-muted-foreground">
                Ranges
              </Text>
              {RANGE_COLUMNS.map((columnId) => {
                const column = getColumn(columnId);
                if (column === null) return null;
                const available = column.source !== null;
                const isActive = isRangeActive(filters.ranges?.[columnId]);
                const hint = unitHint(columnId);

                return (
                  <div
                    key={columnId}
                    className="grid grid-cols-[7.5rem_1fr_1fr] items-center gap-2"
                  >
                    <Label
                      className="flex min-w-0 items-center gap-1 text-xs"
                      title={
                        available
                          ? column.description
                          : (column.unavailableReason ?? 'No data source for this field')
                      }
                    >
                      <span className="truncate">{column.label}</span>
                      {hint !== '' && (
                        <span className="shrink-0 text-[0.625rem] text-subtle-foreground">
                          {hint}
                        </span>
                      )}
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      disabled={!available}
                      value={bound(columnId, 'min')}
                      onChange={(event) => editBound(columnId, 'min', event.target.value)}
                      placeholder="Min"
                      aria-label={`${column.label} minimum`}
                      className={isActive ? 'border-primary/50' : ''}
                    />
                    <Input
                      type="number"
                      inputMode="decimal"
                      disabled={!available}
                      value={bound(columnId, 'max')}
                      onChange={(event) => editBound(columnId, 'max', event.target.value)}
                      placeholder="Max"
                      aria-label={`${column.label} maximum`}
                      className={isActive ? 'border-primary/50' : ''}
                    />
                  </div>
                );
              })}
            </div>

            {/* Technical conditions */}
            <div className="flex flex-col gap-1">
              <Text variant="label" className="text-muted-foreground">
                Technical
              </Text>
              {flags.map(({ flag, available }) => {
                const id = `flag-${flag.id}`;
                return (
                  <div key={flag.id} className="flex items-center gap-2 py-0.5">
                    <Checkbox
                      id={id}
                      disabled={!available}
                      checked={selectedFlags.has(flag.id)}
                      onCheckedChange={() =>
                        onChange({ ...filters, flags: toggleFacet(filters.flags ?? [], flag.id) })
                      }
                    />
                    <Label htmlFor={id} className="cursor-pointer text-xs" title={flag.description}>
                      {flag.label}
                    </Label>
                  </div>
                );
              })}
            </div>

            {/* Sectors — only the ones actually present in this list */}
            {sectors.length > 0 && (
              <div className="flex flex-col gap-1">
                <Text variant="label" className="text-muted-foreground">
                  Sector
                </Text>
                <div className="flex flex-wrap gap-1">
                  {sectors.map((sector) => (
                    <Button
                      key={sector}
                      variant={selectedSectors.has(sector) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        onChange({
                          ...filters,
                          sectors: toggleFacet(filters.sectors ?? [], sector),
                        })
                      }
                    >
                      {sector}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {exchanges.length > 1 && (
              <div className="flex flex-col gap-1">
                <Text variant="label" className="text-muted-foreground">
                  Exchange
                </Text>
                <div className="flex flex-wrap gap-1">
                  {exchanges.map((exchange) => (
                    <Button
                      key={exchange}
                      variant={selectedExchanges.has(exchange) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        onChange({
                          ...filters,
                          exchanges: toggleFacet(filters.exchanges ?? [], exchange),
                        })
                      }
                    >
                      {exchange}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
