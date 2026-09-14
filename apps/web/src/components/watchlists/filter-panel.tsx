'use client';

import { FilterIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Text } from '@/components/ui/typography';
import { countActiveFilters, toggleFacet } from '@/lib/watchlist-filters';
import type { WatchlistFilterStateDto } from '@/lib/watchlist-types';

/**
 * The filters popover.
 *
 * Direction, sector and exchange only. The numeric range inputs and the
 * technical-condition checkboxes are deliberately not rendered for now; the
 * filtering logic behind them (`watchlist-filters`) is kept so they can return
 * without rework.
 */

const DIRECTIONS = [
  { value: 'all', label: 'All' },
  { value: 'advancing', label: 'Advancing' },
  { value: 'declining', label: 'Declining' },
  { value: 'unchanged', label: 'Unchanged' },
] as const;

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

  const selectedSectors = new Set(filters.sectors ?? []);
  const selectedExchanges = new Set(filters.exchanges ?? []);

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
