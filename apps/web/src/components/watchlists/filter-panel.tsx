'use client';

import { FilterIcon } from 'lucide-react';
import { AdaptivePopover, PanelBody, PanelHeader } from '@/components/ui/adaptive-popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Text } from '@/components/ui/typography';
import { countActiveFilters, toggleFacet } from '@/lib/watchlist-filters';
import type { WatchlistFilterStateDto } from '@/lib/watchlist-types';

/**
 * The filters panel: a popover from `sm`, a bottom sheet on phones.
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
    <AdaptivePopover
      title="Filters"
      trigger={
        <Button variant="outline" size="sm">
          <FilterIcon />
          Filters
          {active > 0 && (
            <Badge variant="default" size="sm">
              {active}
            </Badge>
          )}
        </Button>
      }
    >
      <PanelHeader
        title="Filters"
        action={
          <Button variant="ghost" size="sm" disabled={active === 0} onClick={onClear}>
            Clear all
          </Button>
        }
      />

      <PanelBody>
        <div className="flex flex-col gap-4 px-4 py-3">
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
                  direction: (value === '' ? 'all' : value) as WatchlistFilterStateDto['direction'],
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
      </PanelBody>
    </AdaptivePopover>
  );
}
