import type * as React from 'react';
import { PercentChange } from '@/components/market/numeric';
import { largeCurrency, quantity, signedPercent } from '@/lib/format';
import { gmpText, istDayTime, shortDate, times } from '@/lib/ipo-format';
import type { IpoDetailDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { UnofficialTag } from '../ipo-chip';
import { bandText, sharePrice } from '../ipo-figures';

function Tile({
  label,
  value,
  hint,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-subtle sm:px-4 sm:py-3',
        className,
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="figure font-medium text-foreground text-lg tracking-tight sm:text-xl">
        {value}
      </span>
      {hint !== undefined && <span className="text-2xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** `₹145.00 Cr fresh + 15,00,000 shares for sale`, in the issue's own terms. */
function sizeHint(size: IpoDetailDto['issueSize']): string | undefined {
  const part = (paise: number | null, shares: number | null) =>
    paise !== null ? largeCurrency(paise) : shares !== null ? `${quantity(shares)} shares` : null;
  const fresh = part(size.freshPaise, size.freshShares);
  const ofs = part(size.offerForSalePaise, size.offerForSaleShares);
  if (fresh !== null && ofs !== null) return `${fresh} fresh + ${ofs} for sale`;
  if (fresh !== null) return 'fresh issue only';
  if (ofs !== null) return 'offer for sale only';
  return undefined;
}

/**
 * The five figures a reader looks for first. The GMP tile is fenced in amber
 * and labelled unofficial; on a phone the issue size steps back to the
 * details table so the first screen holds four tiles.
 */
export function IpoKeyFigures({ ipo }: { ipo: IpoDetailDto }) {
  const upper = ipo.priceBand?.highPaise ?? ipo.issuePricePaise;
  const minQty = ipo.minBidQuantity ?? ipo.lotSize;
  const gmp = ipo.gmpPanel;
  return (
    <section
      aria-label="Key figures"
      className={cn(
        'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3',
        gmp.available ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
      )}
    >
      <Tile
        label={ipo.issueMethod === 'fixed_price' ? 'Issue price' : 'Price band'}
        value={bandText(ipo.priceBand)}
        hint={
          ipo.faceValuePaise === null
            ? 'per share'
            : `per share · face value ${sharePrice(ipo.faceValuePaise)}`
        }
      />
      <Tile
        label="Min. investment"
        value={sharePrice(ipo.minInvestmentPaise)}
        hint={
          minQty === null || upper === null
            ? undefined
            : `${minQty === ipo.lotSize ? '1 lot · ' : 'minimum order · '}${quantity(minQty)} shares at ${sharePrice(upper)}`
        }
      />
      <Tile
        className="hidden sm:flex"
        label="Issue size"
        value={
          <>
            {ipo.issueSize.totalPaise === null ? '—' : largeCurrency(ipo.issueSize.totalPaise)}
            {ipo.issueSize.basis === 'derived_at_upper_band' && (
              <span className="text-muted-foreground text-sm">†</span>
            )}
          </>
        }
        hint={sizeHint(ipo.issueSize)}
      />
      {ipo.listing !== null ? (
        <Tile
          label="Listing day"
          value={<PercentChange value={ipo.listing.listingGainPercent} />}
          hint={`opened at ${sharePrice(ipo.listing.listingOpenPaise)} on ${shortDate(ipo.listing.listingDate)}`}
        />
      ) : (
        <Tile
          label="Subscribed"
          value={times(ipo.subscription?.totalTimes ?? null)}
          hint={
            ipo.subscription === null
              ? 'no bids published yet'
              : `${ipo.subscription.retailTimes === null ? '' : `retail ${times(ipo.subscription.retailTimes)} · `}${istDayTime(ipo.subscription.asOf)}`
          }
        />
      )}
      {gmp.available && (
        <Tile
          className="border-warning-line bg-warning-soft/40"
          label={
            <span className="flex items-center justify-between gap-2">
              GMP <UnofficialTag className="px-1.5 py-0" />
            </span>
          }
          value={
            <span className="flex items-baseline gap-1.5">
              {gmpText({ latestPaise: gmp.latestPaise, percentOfUpperBand: null })}
              <span className="text-muted-foreground text-sm">
                {signedPercent(gmp.percentOfUpperBand)}
              </span>
            </span>
          }
          hint={`${gmp.sourceName} · ${istDayTime(gmp.observedAt)}${gmp.stale ? ' · stale' : ''}`}
        />
      )}
    </section>
  );
}
