'use client';

import { ActiveFilters, FilterBar, FilterGroup, SearchInput } from '@/components/forms/filter-bar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  activeFilterChips,
  DEFAULT_SIGNAL_FILTERS,
  FAMILY_LABEL,
  QUALITY_BAND_LABEL,
  removeFilter,
  type SignalFamily,
  type SignalFilterState,
} from '@/lib/intraday-display';
import type { SignalQuality } from '@/lib/intraday-types';

/**
 * The signals filter bar.
 *
 * Built from the existing filter shell — same bar, same chips, same clear-all
 * as the screener will use. What this file supplies is the controls; what it
 * never supplies is the arrangement.
 *
 * Defaults matter as much as the controls: the feed opens on LIVE signals
 * only. A page that opened on everything would show yesterday's invalidated
 * setups beside today's active ones, which is precisely the confusion the
 * lifecycle exists to prevent.
 */

const FAMILIES: readonly SignalFamily[] = [
  'breakout',
  'breakdown',
  'vwap',
  'momentum',
  'trend',
  'reversal',
];

const QUALITIES: readonly SignalQuality[] = ['exceptional', 'strong', 'good', 'watch'];

const SCORE_STEPS = [0, 70, 80, 90] as const;
const RR_STEPS = [0, 1.5, 2, 3] as const;

export function SignalFilters({
  filters,
  onChange,
  sectors,
}: {
  filters: SignalFilterState;
  onChange: (next: SignalFilterState) => void;
  sectors: readonly string[];
}) {
  const chips = activeFilterChips(filters);

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <SearchInput
          value={filters.query}
          onValueChange={(query) => onChange({ ...filters, query })}
          placeholder="Search symbol or sector…"
          className="w-full sm:w-56"
        />

        <FilterGroup label="Direction">
          <ToggleGroup
            type="single"
            value={filters.direction}
            onValueChange={(value) => {
              if (value !== '')
                onChange({ ...filters, direction: value as 'all' | 'long' | 'short' });
            }}
            aria-label="Direction"
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="long">BUY</ToggleGroupItem>
            <ToggleGroupItem value="short">SELL</ToggleGroupItem>
          </ToggleGroup>
        </FilterGroup>

        <FilterGroup label="Status">
          <ToggleGroup
            type="single"
            value={filters.status}
            onValueChange={(value) => {
              if (value !== '') {
                onChange({ ...filters, status: value as SignalFilterState['status'] });
              }
            }}
            aria-label="Signal status"
          >
            <ToggleGroupItem value="live">Live</ToggleGroupItem>
            <ToggleGroupItem value="pending">Forming</ToggleGroupItem>
            <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
        </FilterGroup>

        <FilterGroup label="Strength">
          <ToggleGroup
            type="multiple"
            value={[...filters.qualities]}
            onValueChange={(value) => onChange({ ...filters, qualities: value as SignalQuality[] })}
            aria-label="Setup strength"
          >
            {QUALITIES.map((quality) => (
              <ToggleGroupItem key={quality} value={quality}>
                {QUALITY_BAND_LABEL[quality]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FilterGroup>

        <FilterGroup label="Type">
          <ToggleGroup
            type="multiple"
            value={[...filters.families]}
            onValueChange={(value) => onChange({ ...filters, families: value as SignalFamily[] })}
            aria-label="Setup type"
          >
            {FAMILIES.map((family) => (
              <ToggleGroupItem key={family} value={family}>
                {FAMILY_LABEL[family]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FilterGroup>

        {sectors.length > 0 && (
          <FilterGroup label="Sector">
            <Select
              value={filters.sector ?? 'all'}
              onValueChange={(value) =>
                onChange({ ...filters, sector: value === 'all' ? null : value })
              }
            >
              <SelectTrigger className="w-40" aria-label="Sector">
                <SelectValue placeholder="All sectors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sectors</SelectItem>
                {sectors.map((sector) => (
                  <SelectItem key={sector} value={sector}>
                    {sector}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterGroup>
        )}

        <FilterGroup label="Min score">
          <Select
            value={String(filters.minScore)}
            onValueChange={(value) => onChange({ ...filters, minScore: Number(value) })}
          >
            <SelectTrigger className="w-24" aria-label="Minimum score">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCORE_STEPS.map((step) => (
                <SelectItem key={step} value={String(step)}>
                  {step === 0 ? 'Any' : `${step}+`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterGroup>

        <FilterGroup label="Min R:R">
          <Select
            value={String(filters.minRiskReward)}
            onValueChange={(value) => onChange({ ...filters, minRiskReward: Number(value) })}
          >
            <SelectTrigger className="w-24" aria-label="Minimum reward to risk">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RR_STEPS.map((step) => (
                <SelectItem key={step} value={String(step)}>
                  {step === 0 ? 'Any' : `${step}:1`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterGroup>
      </FilterBar>

      <ActiveFilters
        filters={chips}
        onRemove={(id) => onChange(removeFilter(filters, id))}
        onClear={() => onChange(DEFAULT_SIGNAL_FILTERS)}
      />
    </div>
  );
}
