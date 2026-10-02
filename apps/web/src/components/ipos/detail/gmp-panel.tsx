import { Sparkline } from '@/components/market/sparkline';
import { signedPercent } from '@/lib/format';
import { gmpText, istDayTime, shortName } from '@/lib/ipo-format';
import type { GmpPanelDto, GmpTrackRecordDto } from '@/lib/ipo-types';
import { UnofficialTag } from '../ipo-chip';
import { sharePrice } from '../ipo-figures';
import { ExternalLink, FactRow, ModuleCard } from '../module-card';

/**
 * What GMP is, in plain words. One click away beside every GMP figure on the
 * detail page (plan §10.2, owner decision D1).
 */
export function GmpExplainer() {
  return (
    <div className="flex flex-col gap-1.5 text-muted-foreground text-xs">
      <p>
        The grey-market premium is the price some traders informally quote for an IPO&apos;s shares
        before they list, outside any exchange. Nobody regulates it, deals in it cannot be enforced,
        and it can move sharply or vanish overnight.
      </p>
      <p>
        It is <strong className="font-medium text-foreground">not a forecast</strong> of the listing
        price. SEBI has proposed a regulated pre-listing platform to replace it.
      </p>
    </div>
  );
}

const REASON: Readonly<Record<'no_quote' | 'source_disabled' | 'not_tracked', string>> = {
  no_quote: 'The source reports no grey-market quote for this issue.',
  source_disabled: 'EquityWise is not showing GMP at the moment.',
  not_tracked: 'The GMP source has not reported this issue.',
};

const OUTCOME: Readonly<Record<'within' | 'gmp_above' | 'gmp_below', string>> = {
  within: 'close',
  gmp_above: 'GMP higher',
  gmp_below: 'GMP lower',
};

/** How the last GMP before listing compared with the actual listing gain. */
export function GmpTrackRecord({ track }: { track: GmpTrackRecordDto }) {
  if (track.total === 0)
    return (
      <p className="text-muted-foreground text-xs">
        No listed issue in the last {track.months} months has both a GMP quote and a listing price
        to compare yet.
      </p>
    );
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-muted-foreground">
        Last {track.months} months: the final quote was within ±{track.tolerancePoints} points of
        the listing-day gain for{' '}
        <strong className="font-medium text-foreground">
          {track.within} of {track.total}
        </strong>{' '}
        listings; GMP was higher for {track.gmpAbove} and lower for {track.gmpBelow}.
      </p>
      {track.thisIssue !== null && (
        <p className="text-muted-foreground">
          This issue: last GMP {signedPercent(track.thisIssue.lastGmpPercent)}, listed at{' '}
          {signedPercent(track.thisIssue.listingGainPercent)}.
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        <li className="flex justify-between gap-3 bg-surface-sunken px-2.5 py-1.5 text-muted-foreground">
          <span>Issue</span>
          <span>Last GMP → listing</span>
        </li>
        {track.rows.slice(0, 8).map((row) => (
          <li key={row.slug} className="flex justify-between gap-3 px-2.5 py-1.5">
            <span className="min-w-0 truncate" title={row.companyName}>
              {shortName(row.companyName)}
            </span>
            <span className="figure shrink-0 text-right">
              {signedPercent(row.lastGmpPercent)} → {signedPercent(row.listingGainPercent)}
              <span className="sr-only"> ({OUTCOME[row.outcome]})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The detail page's GMP card, fenced in amber. Every figure in it is
 * UNOFFICIAL and labelled as such, attributed and timed, with what GMP is and
 * how it has compared with real listings one click away.
 */
export function GmpPanel({
  gmp,
  track,
  upperBandPaise,
}: {
  gmp: GmpPanelDto;
  track: GmpTrackRecordDto;
  upperBandPaise: number | null;
}) {
  const points = gmp.available
    ? gmp.history.flatMap((h) => (h.gmpPaise === null ? [] : [h.gmpPaise / 100]))
    : [];
  return (
    <ModuleCard
      id="gmp"
      title="Grey-market premium"
      note="An unofficial quote. Not a forecast, and not a price anyone can deal at on an exchange."
      aside={<UnofficialTag />}
      unofficial
    >
      {gmp.available ? (
        <>
          <FactRow label="Latest">
            <span className="figure font-semibold">
              {gmpText({ latestPaise: gmp.latestPaise, percentOfUpperBand: null })}
            </span>
            {gmp.percentOfUpperBand !== null && (
              <span className="figure text-muted-foreground">
                {' '}
                · {signedPercent(gmp.percentOfUpperBand)}
                {upperBandPaise !== null && ` of ${sharePrice(upperBandPaise)}`}
              </span>
            )}
          </FactRow>
          {gmp.rangeLowPaise !== null && gmp.rangeHighPaise !== null && (
            <FactRow label="Range so far">
              <span className="figure">
                {gmpText({ latestPaise: gmp.rangeLowPaise, percentOfUpperBand: null })} to{' '}
                {gmpText({ latestPaise: gmp.rangeHighPaise, percentOfUpperBand: null })}
              </span>
            </FactRow>
          )}
          {points.length > 1 && (
            <FactRow label="Since first reported">
              <Sparkline
                values={points}
                width={120}
                height={28}
                label="Reported GMP over the issue's life"
                tone="neutral"
              />
            </FactRow>
          )}
          <FactRow label="Reported">
            {istDayTime(gmp.observedAt)} IST
            {gmp.stale && (
              <span className="block text-2xs text-muted-foreground">
                more than a day and a half old
              </span>
            )}
          </FactRow>
          <FactRow label="Source">
            <ExternalLink href={gmp.sourceUrl}>{gmp.sourceName}</ExternalLink>
          </FactRow>
        </>
      ) : (
        <p className="border-border border-t px-4 py-3 text-muted-foreground text-xs">
          {REASON[gmp.reason]}
        </p>
      )}
      <details className="group border-border border-t">
        <summary className="flex min-h-10 items-center px-4 py-2 font-medium text-primary text-xs">
          What is GMP?
        </summary>
        <div className="px-4 pb-3">
          <GmpExplainer />
        </div>
      </details>
      <details className="group border-border border-t">
        <summary className="flex min-h-10 items-center px-4 py-2 font-medium text-primary text-xs">
          How GMP has compared with listings
        </summary>
        <div className="px-4 pb-3">
          <GmpTrackRecord track={track} />
        </div>
      </details>
    </ModuleCard>
  );
}
