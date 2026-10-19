'use client';

import { formatPaise } from '@equitywise/shared';
import { Card } from '@/components/ui/card';
import type { StockPageDto } from '@/lib/stock-types';

/**
 * "Company file" — the facts EquityWise holds about the listing itself
 * (stock-header plan §5.5): classification, identifiers, listing age, face
 * value and the dividend record. No description, website or logo: there is no
 * source for them yet, so they are absent rather than invented.
 */

export interface ProfileFact {
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
}

const SERIES: Readonly<Record<string, string>> = {
  EQ: 'EQ · rolling settlement',
  BE: 'BE · trade-for-trade',
  BZ: 'BZ · trade-for-trade, restricted',
};

const KIND: Readonly<Record<string, string>> = {
  interim: 'Interim',
  final: 'Final',
  special: 'Special',
  dividend: 'Dividend',
};

function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function yearsSince(date: string, session: string | null): string | null {
  const to = session ?? date;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return null;
  if (days < 365) return `${Math.floor(days)} days`;
  const years = Math.floor(days / 365.25);
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

/** The facts, in display order — also what the CSV export writes. */
export function profileFacts(data: StockPageDto): ProfileFact[] {
  const out: ProfileFact[] = [];
  const add = (label: string, value: string | null, note: string | null = null) => {
    if (value !== null && value !== '') out.push({ label, value, note });
  };
  add(
    'Industry',
    data.industry ?? 'Unclassified',
    data.industry === null ? 'Not in an NSE index list' : 'NSE index list',
  );
  add(
    'Indices',
    data.indices.length === 0 ? 'None tracked' : data.indices.map((i) => i.label).join(', '),
  );
  add('Series', data.series === null ? null : (SERIES[data.series] ?? data.series));
  add(
    'Listed on NSE',
    data.listingDate === null ? null : longDate(data.listingDate),
    data.listingDate === null ? null : yearsSince(data.listingDate, data.session),
  );
  add('ISIN', data.isin);
  add('Face value', data.faceValuePaise === null ? null : formatPaise(data.faceValuePaise));

  const ttm = data.values?.dividendTtm;
  const yieldPct = data.values?.dividendYield;
  if (typeof ttm === 'number') {
    add(
      'Dividends, 12 months',
      ttm === 0 ? 'None' : `${formatPaise(ttm)} a share`,
      typeof yieldPct === 'number' && ttm > 0 ? `${yieldPct.toFixed(2)}% of the close` : null,
    );
  } else if (data.dividends.length > 0) {
    add('Dividends, 12 months', 'Not exact', 'One amount could not be read exactly');
  }
  const last = data.dividends[0];
  if (last !== undefined) {
    add(
      'Last dividend',
      last.amountPaise === null ? 'Amount unreadable' : formatPaise(last.amountPaise),
      `${KIND[last.kind] ?? 'Dividend'} · ex-date ${longDate(last.exDate)}`,
    );
  }
  add('Last session', data.session === null ? null : longDate(data.session));
  return out;
}

export function CompanyFile({ facts }: { facts: readonly ProfileFact[] }) {
  return (
    <Card className="flex flex-col gap-1 p-4" aria-labelledby="company-file">
      <h2 id="company-file" className="font-display font-semibold text-base">
        Company file
      </h2>
      <dl className="flex flex-col">
        {facts.map((f) => (
          <div
            key={f.label}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 border-border border-b py-2 text-sm last:border-b-0"
          >
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="min-w-0 text-right">
              <span className="block break-words font-medium">{f.value}</span>
              {f.note !== null && (
                <span className="block text-2xs text-muted-foreground">{f.note}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-2xs text-muted-foreground">
        From NSE’s equity list, index files and corporate actions. No company description or
        fundamentals yet.
      </p>
    </Card>
  );
}
