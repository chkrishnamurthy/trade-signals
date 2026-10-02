import { PercentChange } from '@/components/market/numeric';
import { longDate } from '@/lib/ipo-format';
import type { ListingSummaryDto } from '@/lib/ipo-types';
import { sharePrice } from '../ipo-figures';
import { FactRow, ModuleCard } from '../module-card';

function Moved({ paise, percent }: { paise: number; percent: number | null }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="figure">{sharePrice(paise)}</span>
      <PercentChange value={percent} size="sm" />
    </span>
  );
}

/**
 * How the issue listed, from the exchange's own end-of-day file: issue price,
 * listing open, listing-day close and the latest close. Past listing gains do
 * not indicate future returns — the disclaimer says so beneath.
 */
export function IpoListing({ listing }: { listing: ListingSummaryDto }) {
  return (
    <ModuleCard
      id="listing"
      title="Listing performance"
      note={`Listed on ${listing.exchange} on ${longDate(listing.listingDate)}. Prices from the exchange's end-of-day file; changes are from the issue price.`}
    >
      <FactRow label="Issue price">
        <span className="figure">{sharePrice(listing.issuePricePaise)}</span>
      </FactRow>
      <FactRow label="Listing price (open)">
        <Moved paise={listing.listingOpenPaise} percent={listing.listingGainPercent} />
      </FactRow>
      <FactRow label="Listing-day close">
        <Moved paise={listing.listingClosePaise} percent={listing.listingDayChangePercent} />
      </FactRow>
      {listing.latestClosePaise !== null && listing.latestCloseDate !== null && (
        <FactRow label={`Close on ${longDate(listing.latestCloseDate)}`}>
          <Moved paise={listing.latestClosePaise} percent={listing.sinceIssuePercent} />
        </FactRow>
      )}
    </ModuleCard>
  );
}
