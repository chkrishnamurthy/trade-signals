import { PercentChange } from '@/components/market/numeric';
import { signedPercent } from '@/lib/format';
import { BOARD_WORD, gmpText, istDayTime, shortDate, trackSpan } from '@/lib/ipo-format';
import { issueHref, tableHref } from '@/lib/ipo-routes';
import type { IpoDashboardDto, IpoListItemDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { SmeMark } from '../ipo-cells';
import { UnofficialTag } from '../ipo-chip';
import { sharePrice } from '../ipo-figures';
import { IssueLink, ModuleCard, ModuleTable } from '../module-card';

const slug = (row: IpoListItemDto) => row.slug;
const rowHref = (row: IpoListItemDto) => issueHref(row.slug);

/** A company link, marked SME when the Overview mixes both boards. */
function Company({ row, mixed }: { row: IpoListItemDto; mixed: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <IssueLink slug={row.slug} name={row.companyName} />
      {mixed && row.board === 'sme' && <SmeMark />}
    </span>
  );
}

/** A GMP amount alone: `₹20`, `−₹5`. */
const gmpAmount = (row: IpoListItemDto) =>
  row.gmp === null ? '—' : gmpText({ latestPaise: row.gmp.latestPaise, percentOfUpperBand: null });

/**
 * The grey-market premium, fenced in amber: unofficial, attributed, timed and
 * set beside how such quotes have compared with real listings. Its figures are
 * never coloured as gains — this is a third party's quote, not a price move.
 */
export function GmpModule({ data }: { data: IpoDashboardDto }) {
  const latest = data.gmp
    .map((r) => r.gmp?.observedAt ?? '')
    .sort()
    .at(-1);
  const mixed = data.board === 'all';
  return (
    <ModuleCard
      id="ipo-gmp"
      title="Grey-market premium"
      note="The premium over the upper price band, as one website reports it. Not verified, not a forecast."
      aside={<UnofficialTag />}
      unofficial
      footer={
        <>
          <span className="block">
            Source: {data.gmpPolicy.sourceName ?? '—'}
            {latest !== undefined && latest !== '' && ` · latest report ${istDayTime(latest)} IST`}
          </span>
          {data.gmpTracks
            .filter((t) => t.total > 0)
            .map((t) => (
              <span key={t.board} className="block">
                {trackSpan(t)}
                {mixed ? `, ${BOARD_WORD[t.board]} listings` : ''}: the final quote was within ±
                {t.tolerancePoints} points of the listing-day gain for {t.within} of {t.total}.
              </span>
            ))}
        </>
      }
    >
      <ModuleTable
        caption="Grey-market premium, unofficial"
        rows={data.gmp}
        rowKey={slug}
        empty="The source reports no grey-market quote for an unlisted issue in view."
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => <Company row={r} mixed={mixed} />,
          },
          {
            id: 'band',
            header: 'Upper band',
            width: 'w-24',
            align: 'end',
            cell: (r) => (
              <span className="figure text-muted-foreground">
                {sharePrice(r.priceBand?.highPaise ?? null)}
              </span>
            ),
          },
          {
            id: 'gmp',
            header: 'GMP',
            width: 'w-20',
            align: 'end',
            cell: (r) => (
              <span
                className={cn('figure', r.gmp?.stale ? 'text-subtle-foreground' : 'font-medium')}
              >
                {gmpAmount(r)}
              </span>
            ),
          },
          {
            id: 'pct',
            header: 'vs band',
            width: 'w-20',
            align: 'end',
            cell: (r) => (
              <span className="figure text-muted-foreground">
                {signedPercent(r.gmp?.percentOfUpperBand ?? null)}
              </span>
            ),
          },
        ]}
        mobile={(r) => ({
          title: r.companyName,
          sub: `Upper band ${sharePrice(r.priceBand?.highPaise ?? null)}${r.gmp?.stale ? ' · stale quote' : ''}`,
          value: <span className="figure font-medium">{gmpAmount(r)}</span>,
          valueSub: signedPercent(r.gmp?.percentOfUpperBand ?? null),
          href: rowHref(r),
        })}
      />
    </ModuleCard>
  );
}

/** Recent listings against the issue price, from the exchange's end-of-day file. */
export function ListingsModule({ data }: { data: IpoDashboardDto }) {
  const s = data.yearStats;
  const mixed = data.board === 'all';
  return (
    <ModuleCard
      id="ipo-listings"
      title="Listing performance"
      note="Recent listings against their issue price: the listing-day open and the latest close, from the exchange's end-of-day prices."
      footer={
        s.withListingPrice === 0
          ? `No ${s.year} listing has exchange prices yet.`
          : `${s.year}: ${s.openedAboveIssue} of ${s.withListingPrice} listings with prices opened above the issue price.`
      }
      link={{ href: tableHref(data.board, { status: 'listed' }), label: 'All listings' }}
    >
      <ModuleTable
        caption="Listing performance"
        rows={data.listings}
        rowKey={slug}
        empty="No recent listing has exchange prices yet."
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => <Company row={r} mixed={mixed} />,
          },
          {
            id: 'issue',
            header: 'Issue price',
            width: 'w-24',
            align: 'end',
            cell: (r) => (
              <span className="figure text-muted-foreground">
                {sharePrice(r.listing?.issuePricePaise ?? null)}
              </span>
            ),
          },
          {
            id: 'open',
            header: 'Listing day',
            width: 'w-24',
            align: 'end',
            cell: (r) => <PercentChange value={r.listing?.listingGainPercent ?? null} size="sm" />,
          },
          {
            id: 'now',
            header: 'Now',
            width: 'w-24',
            align: 'end',
            cell: (r) => <PercentChange value={r.listing?.sinceIssuePercent ?? null} size="sm" />,
          },
        ]}
        mobile={(r) => ({
          title: r.companyName,
          sub: `Issue ${sharePrice(r.listing?.issuePricePaise ?? null)} · listed ${shortDate(r.listingDate)}`,
          value: <PercentChange value={r.listing?.listingGainPercent ?? null} size="sm" />,
          valueSub: (
            <span className="inline-flex items-baseline gap-1">
              now <PercentChange value={r.listing?.sinceIssuePercent ?? null} size="sm" />
            </span>
          ),
          href: rowHref(r),
        })}
      />
    </ModuleCard>
  );
}
