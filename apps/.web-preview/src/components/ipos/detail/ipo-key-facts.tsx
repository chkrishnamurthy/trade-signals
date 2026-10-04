import type * as React from 'react';
import { MetricHint } from '@/components/data-display/metric-card';
import { largeCurrency, quantity } from '@/lib/format';
import { shortDate } from '@/lib/ipo-format';
import type { IpoDetailDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { sharePrice } from '../ipo-figures';
import { ModuleCard } from '../module-card';
import { FactSource } from './fact-source';

/** `Wed 30 Sep – Mon 5 Oct 2026`. */
function biddingText(open: string | null, close: string | null): string {
  if (open === null && close === null) return 'Dates not announced';
  const year = (close ?? open ?? '').slice(0, 4);
  if (open === null) return `Closes ${shortDate(close)} ${year}`;
  if (close === null) return `Opens ${shortDate(open)} ${year}`;
  return `${shortDate(open)} – ${shortDate(close)} ${year}`;
}

function Item({
  label,
  muted = false,
  children,
}: {
  label: React.ReactNode;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-border border-b px-4 py-2.5 text-sm sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:justify-normal sm:gap-3">
      <dt className="shrink-0 text-muted-foreground text-xs sm:text-sm">{label}</dt>
      <dd className={cn('min-w-0 text-right sm:text-left', muted && 'text-muted-foreground')}>
        {children}
      </dd>
    </div>
  );
}

/**
 * The issue's terms as the exchange published them, each official value with
 * its source beside it. A calculated value says so; a partly parsed
 * issue-size sentence is shown as published.
 */
export function IpoKeyFacts({ ipo }: { ipo: IpoDetailDto }) {
  const s = ipo.fieldSources;
  const size = ipo.issueSize;
  const derived = size.basis === 'derived_at_upper_band';
  const upper = ipo.priceBand?.highPaise ?? ipo.issuePricePaise;
  const shares = (n: number | null) => (n === null ? '—' : `${quantity(n)} shares`);
  const part = (paise: number | null, count: number | null) => {
    if (count !== null && paise !== null)
      return `${quantity(count)} shares ≈ ${largeCurrency(paise)}`;
    if (paise !== null) return largeCurrency(paise);
    return count === null ? '—' : shares(count);
  };
  const listing = ipo.listingDate ?? ipo.expectedListingDate;
  const designated = ipo.designatedExchange ?? ipo.exchanges[0] ?? 'the exchange';

  return (
    <ModuleCard
      id="details"
      title="IPO details"
      note={`As published on ${designated}'s issue page.`}
      footer={
        derived || (size.text !== null && size.totalPaise === null) ? (
          <>
            {derived && upper !== null && (
              <span className="block">
                † Part of the issue is stated in shares; its rupee value is calculated at the upper
                end of the band ({sharePrice(upper)}).
              </span>
            )}
            {size.text !== null && size.totalPaise === null && (
              <span className="block">
                Issue size as published: <q>{size.text}</q>
              </span>
            )}
          </>
        ) : undefined
      }
    >
      <dl className="grid border-border border-t sm:grid-cols-2 [&>div:last-child]:border-b-0 sm:[&>div:nth-last-child(2):nth-child(odd)]:border-b-0">
        <Item label="Bidding">{biddingText(ipo.openDate, ipo.closeDate)}</Item>
        <Item label="Listing">
          {listing === null
            ? '—'
            : `${shortDate(listing)} ${listing.slice(0, 4)}${ipo.listingDate === null ? ' (expected)' : ''}`}
        </Item>
        <Item label={ipo.issueMethod === 'fixed_price' ? 'Issue price' : 'Price band'}>
          <span className="figure">
            {ipo.priceBand === null
              ? '—'
              : ipo.priceBand.lowPaise === ipo.priceBand.highPaise
                ? `${sharePrice(ipo.priceBand.highPaise)} per share`
                : `${sharePrice(ipo.priceBand.lowPaise)} to ${sharePrice(ipo.priceBand.highPaise)} per share`}
          </span>
          <FactSource source={s.priceBandHighPaise} />
        </Item>
        {ipo.issuePricePaise !== null && ipo.issueMethod !== 'fixed_price' && (
          <Item label="Final issue price">
            <span className="figure">{sharePrice(ipo.issuePricePaise)}</span>
            <FactSource source={s.issuePricePaise} />
          </Item>
        )}
        <Item label="Face value">
          <span className="figure">
            {ipo.faceValuePaise === null ? '—' : `${sharePrice(ipo.faceValuePaise)} per share`}
          </span>
          <FactSource source={s.faceValuePaise} />
        </Item>
        <Item label="Lot size">
          <span className="figure">{shares(ipo.lotSize)}</span>
          <FactSource source={s.lotSize} />
        </Item>
        {ipo.minBidQuantity !== null && ipo.minBidQuantity !== ipo.lotSize && (
          <Item label="Minimum order">
            <span className="figure">{shares(ipo.minBidQuantity)}</span>
          </Item>
        )}
        {ipo.retailMaxPaise !== null && (
          <Item label="Retail max. bid">
            <span className="figure">{sharePrice(ipo.retailMaxPaise)}</span>
            {ipo.maxRetailLots !== null && (
              <span className="text-muted-foreground">
                {' '}
                · {ipo.maxRetailLots} lots
                <MetricHint>
                  Whole lots that fit under the retail limit, at the upper end of the band.
                </MetricHint>
              </span>
            )}
          </Item>
        )}
        <Item label="Issue size">
          <span className="figure">
            {size.totalPaise === null ? '—' : largeCurrency(size.totalPaise)}
            {derived && ' †'}
          </span>
        </Item>
        {ipo.sharesOffered !== null && (
          <Item label="Shares offered">
            <span className="figure">{quantity(ipo.sharesOffered)}</span>
          </Item>
        )}
        <Item label="Fresh issue">
          <span className="figure">{part(size.freshPaise, size.freshShares)}</span>
        </Item>
        <Item label="Offer for sale" muted={derived && size.offerForSaleShares !== null}>
          <span className="figure">
            {part(size.offerForSalePaise, size.offerForSaleShares)}
            {derived && size.offerForSaleShares !== null && ' †'}
          </span>
        </Item>
        {size.marketMakerShares !== null && (
          <Item label="Market-maker portion">{shares(size.marketMakerShares)}</Item>
        )}
        {size.anchorShares !== null && (
          <Item label="Anchor portion">{shares(size.anchorShares)}</Item>
        )}
        {ipo.employeeDiscountPaise !== null && (
          <Item label="Employee discount">{sharePrice(ipo.employeeDiscountPaise)} per share</Item>
        )}
        <Item label="Issue type">
          {ipo.issueMethod === 'fixed_price'
            ? 'Fixed price'
            : ipo.issueMethod === 'book_building'
              ? 'Book-built'
              : '—'}
        </Item>
        <Item label="Listing at">{ipo.exchanges.length > 0 ? ipo.exchanges.join(', ') : '—'}</Item>
        {ipo.nseSymbol !== null && (
          <Item label="NSE symbol">
            <span className="font-mono text-xs">{ipo.nseSymbol}</span>
          </Item>
        )}
        {ipo.bseScripCode !== null && (
          <Item label="BSE code">
            <span className="font-mono text-xs">{ipo.bseScripCode}</span>
          </Item>
        )}
        {ipo.isin !== null && (
          <Item label="ISIN">
            <span className="font-mono text-xs">{ipo.isin}</span>
          </Item>
        )}
      </dl>
    </ModuleCard>
  );
}
