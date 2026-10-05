'use client';

import { formatPaise } from '@equitywise/shared';
import { DownloadIcon } from 'lucide-react';
import { MetricHint } from '@/components/data-display/metric-card';
import { PriceChange } from '@/components/market/numeric';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { OpenLotDto, PortfolioTaxDto, UnrealisedTermDto } from '@/lib/portfolio-types';
import { longDate } from './portfolio-client';

/**
 * "Shares still held" on the Tax tab: every tax lot not yet removed, valued
 * today, with unrealised gains split by today's term. Bonus shares are their
 * own lots from the bonus date; lots acquired before February 2018 show the
 * 2018 rule. Describes; never suggests which shares to remove.
 */

const money = (p: number) => formatPaise(p, { decimals: 0 });

function TermTotal({
  label,
  hint,
  total,
}: {
  label: string;
  hint: string;
  total: UnrealisedTermDto;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md bg-surface-sunken p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <MetricHint>{hint}</MetricHint>
      </div>
      <div className="text-lg font-semibold tabular-nums">
        {total.lots === 0 ? '—' : <PriceChange paise={total.gainPaise} />}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {total.lots === 0
          ? 'No lots'
          : `${total.lots} ${total.lots === 1 ? 'lot' : 'lots'} · worth ${money(total.valuePaise)}`}
      </div>
    </div>
  );
}

function CostNotes({ lot }: { lot: OpenLotDto }) {
  return (
    <>
      {lot.grandfathered && lot.fmvPaise !== null && (
        <span className="block text-xs text-muted-foreground">
          2018 rule: paid {money(lot.costPaise)}, 31 Jan 2018 value {money(lot.fmvPaise)}
        </span>
      )}
      {lot.bonus && (
        <span className="block text-xs text-muted-foreground">Bonus shares: cost nil</span>
      )}
      {lot.fmvMissing && (
        <span className="block text-xs text-muted-foreground">No 31 Jan 2018 price found</span>
      )}
    </>
  );
}

function TermBadge({ lot }: { lot: OpenLotDto }) {
  return lot.term === 'long' ? (
    <Badge variant="neutral">Long term</Badge>
  ) : (
    <Badge variant="outline">Short term · long term in {lot.daysToLongTerm} days</Badge>
  );
}

export function SharesStillHeld({ tax }: { tax: PortfolioTaxDto }) {
  const { openLots: lots, unrealised } = tax;
  return (
    <section
      aria-labelledby="still-held-h"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-subtle"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="still-held-h" className="flex items-center gap-1 text-sm font-semibold">
          Shares still held ({lots.length} {lots.length === 1 ? 'lot' : 'lots'})
          <MetricHint>
            Each purchase not yet removed, as a tax lot, valued at today&apos;s price. Bonus shares
            are their own lots, acquired on the bonus date at no cost. Unrealised: nothing is taxed
            until shares are disposed of.
          </MetricHint>
        </h2>
        {lots.length > 0 && (
          <Button asChild size="sm" variant="outline">
            <a href="/api/portfolio/tax/lots" download>
              <DownloadIcon /> Export shares still held (CSV)
            </a>
          </Button>
        )}
      </div>

      {lots.length === 0 ? (
        <p className="text-sm text-muted-foreground">You hold no shares right now.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TermTotal
              label="Unrealised, short term"
              hint="Lots held 12 months or less today: today's value less what was paid."
              total={unrealised.short}
            />
            <TermTotal
              label="Unrealised, long term"
              hint="Lots held more than 12 months today: today's value less the cost used, with the 2018 rule for shares acquired before February 2018."
              total={unrealised.long}
            />
          </div>
          {unrealised.unpriced > 0 && (
            <p className="text-xs text-muted-foreground">
              {unrealised.unpriced} {unrealised.unpriced === 1 ? 'lot has' : 'lots have'} no price
              today and {unrealised.unpriced === 1 ? 'is' : 'are'} left out of these totals.
            </p>
          )}

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Tax lots still held, by stock and acquired date, valued today
              </caption>
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    Stock
                  </th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    Acquired
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                    Shares
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                    Cost used
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                    Value today
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                    Unrealised
                  </th>
                  <th scope="col" className="py-1.5 font-medium">
                    Term today
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {lots.map((lot) => (
                  <tr
                    key={`${lot.symbol}${lot.acquiredOn}${lot.trackedFrom}${lot.shares}${lot.bonus}`}
                    className="align-top"
                  >
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                      {lot.symbol}
                    </th>
                    <td className="py-1.5 pr-3">
                      {longDate(lot.acquiredOn)}
                      <span className="block text-xs text-muted-foreground">
                        {lot.daysHeld.toLocaleString('en-IN')} days
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{lot.shares.toLocaleString('en-IN')}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {money(lot.costUsedPaise)}
                      <CostNotes lot={lot} />
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {lot.valuePaise === null ? '—' : money(lot.valuePaise)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {lot.gainPaise === null ? '—' : <PriceChange paise={lot.gainPaise} />}
                    </td>
                    <td className="py-1.5">
                      <TermBadge lot={lot} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col divide-y divide-border md:hidden">
            {lots.map((lot) => (
              <li
                key={`${lot.symbol}${lot.acquiredOn}${lot.trackedFrom}${lot.shares}${lot.bonus}`}
                className="py-2 text-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{lot.symbol}</span>
                  {lot.gainPaise === null ? (
                    <span className="text-muted-foreground">No price</span>
                  ) : (
                    <PriceChange paise={lot.gainPaise} />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {lot.shares.toLocaleString('en-IN')} shares · acquired{' '}
                    {longDate(lot.acquiredOn)}
                  </span>
                  <span>Cost used {money(lot.costUsedPaise)}</span>
                  {lot.valuePaise !== null && <span>Value {money(lot.valuePaise)}</span>}
                  <span>
                    {lot.term === 'long'
                      ? 'Long term'
                      : `Short term · long term in ${lot.daysToLongTerm} days`}
                  </span>
                  {lot.bonus && <span>Bonus shares</span>}
                  {lot.grandfathered && <span>2018 rule</span>}
                  {lot.fmvMissing && <span>No 31 Jan 2018 price</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
