import type { Route } from 'next';
import { PercentChange } from '@/components/market/numeric';
import { signedPercent } from '@/lib/format';
import {
  BOARD_LABEL,
  BOARD_WORD,
  dateRange,
  gmpText,
  istDayTime,
  shortDate,
  stateLabel,
  statusParts,
  times,
} from '@/lib/ipo-format';
import type { IpoDashboardDto, IpoListItemDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { StateChip, ToneLegend, UnofficialTag } from '../ipo-chip';
import { sharePrice } from '../ipo-figures';
import { IssueLink, ModuleCard, ModuleTable } from '../module-card';

const slug = (row: IpoListItemDto) => row.slug;
const issueHref = (row: IpoListItemDto) => `/ipos/${row.slug}`;
const boardHref = (board: IpoDashboardDto['board'], query = '') =>
  `/ipos/${board}${query}` as Route;

/** True when any row shows a date computed from the T+3 rule. */
const anyExpected = (rows: readonly IpoListItemDto[], today: string) =>
  rows.some((r) => stateLabel(r, today).label.endsWith('*'));

/** Open, upcoming, awaiting listing and just listed — the board right now. */
export function CurrentModule({ data }: { data: IpoDashboardDto }) {
  const board = BOARD_LABEL[data.board];
  return (
    <ModuleCard
      id="ipo-current"
      title="Current & upcoming"
      note={`${board} issues open, upcoming, waiting to list, and listed this week.`}
      aside={
        <ToneLegend
          className="hidden sm:flex"
          items={[
            { tone: 'open', label: 'Open' },
            { tone: 'waiting', label: 'Yet to list' },
            { tone: 'info', label: 'Upcoming' },
          ]}
        />
      }
      footer={
        <>
          {data.counts.open} open · {data.awaitingListing} yet to list · {data.counts.upcoming}{' '}
          upcoming
          {anyExpected(data.current, data.today) && (
            <span className="block">* Expected, from SEBI&apos;s T+3 timetable.</span>
          )}
        </>
      }
      link={{ href: boardHref(data.board), label: `All ${BOARD_WORD[data.board]} IPOs` }}
    >
      <ModuleTable
        caption={`Current and upcoming ${BOARD_WORD[data.board]} IPOs`}
        rows={data.current}
        rowKey={slug}
        rowTone={(r) => statusParts(r, data.today).tone}
        empty={`No ${BOARD_WORD[data.board]} issue is open, upcoming or waiting to list.`}
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => <IssueLink slug={r.slug} name={r.companyName} />,
          },
          {
            id: 'dates',
            header: 'Bidding',
            width: 'w-28',
            cell: (r) => (
              <span className="figure text-muted-foreground text-xs">
                {dateRange(r.openDate, r.closeDate)}
              </span>
            ),
          },
          {
            id: 'status',
            header: 'Status',
            width: 'w-40',
            align: 'end',
            cell: (r) => {
              const s = stateLabel(r, data.today);
              return <StateChip tone={s.tone}>{s.label}</StateChip>;
            },
          },
        ]}
        mobile={(r) => {
          const s = stateLabel(r, data.today);
          return {
            title: r.companyName,
            sub: dateRange(r.openDate, r.closeDate),
            value: <StateChip tone={s.tone}>{s.label}</StateChip>,
            href: issueHref(r),
          };
        }}
      />
    </ModuleCard>
  );
}

/** When a subscription figure was read: a time while bidding, "At close" after. */
function asOfLabel(row: IpoListItemDto): string {
  const s = row.subscription;
  if (s === null) return '—';
  const istDay = new Date(new Date(s.asOf).getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const scope = row.exchanges.length > 1 && s.scope !== 'consolidated' ? ' · NSE only' : '';
  if (row.status !== 'open' && row.closeDate !== null && istDay >= row.closeDate)
    return `At close${scope}`;
  return `${istDayTime(s.asOf)}${scope}`;
}

/** Times subscribed, quieter below 1× (fewer bids than shares so far). */
function Times({ value, strong = false }: { value: number | null; strong?: boolean }) {
  return (
    <span
      className={cn(
        'figure',
        value === null || value < 1 ? 'text-muted-foreground' : strong && 'font-medium',
      )}
    >
      {times(value)}
    </span>
  );
}

/**
 * Demand so far — not a forecast of anything. SME shows the total alone: NSE
 * publishes no SME issue's shares reserved per category, so a category ratio
 * would be invented.
 */
export function SubscriptionModule({ data }: { data: IpoDashboardDto }) {
  const sme = data.board === 'sme';
  return (
    <ModuleCard
      id="ipo-subscription"
      title="Subscription"
      note={
        sme
          ? "Times subscribed: every bid ÷ the issue size NSE states. NSE does not publish an SME issue's shares per investor category, so only the total is shown. Above 1× means more bids than shares."
          : 'Times subscribed: shares bid ÷ shares offered, NSE and BSE bids together where both publish. Above 1× means more bids than shares.'
      }
      footer="Open issues update about every two hours from 10:35 am to 5:35 pm, then once after close."
      link={{ href: boardHref(data.board, '?status=open'), label: 'Open issues' }}
    >
      <ModuleTable
        caption="Subscription so far"
        rows={data.subscription}
        rowKey={slug}
        empty="No open or recently closed issue has published bids yet."
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => <IssueLink slug={r.slug} name={r.companyName} />,
          },
          {
            id: 'asof',
            header: 'As of (IST)',
            width: 'w-32',
            cell: (r) => <span className="text-muted-foreground text-xs">{asOfLabel(r)}</span>,
          },
          ...(sme
            ? []
            : [
                {
                  id: 'retail',
                  header: 'Retail',
                  width: 'w-16',
                  align: 'end' as const,
                  cell: (r: IpoListItemDto) => (
                    <Times value={r.subscription?.retailTimes ?? null} />
                  ),
                },
              ]),
          {
            id: 'total',
            header: 'Total',
            width: 'w-20',
            align: 'end',
            cell: (r) => <Times value={r.subscription?.totalTimes ?? null} strong />,
          },
        ]}
        mobile={(r) => ({
          title: r.companyName,
          sub: asOfLabel(r),
          value: <Times value={r.subscription?.totalTimes ?? null} strong />,
          valueSub:
            r.subscription?.retailTimes == null
              ? undefined
              : `retail ${times(r.subscription.retailTimes)}`,
          href: issueHref(r),
        })}
      />
    </ModuleCard>
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
  const track = data.gmpTrack;
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
          {track !== null && track.total > 0 && (
            <span className="block">
              Last {track.months} months: the final quote was within ±{track.tolerancePoints} points
              of the listing-day gain for {track.within} of {track.total} listings.
            </span>
          )}
        </>
      }
    >
      <ModuleTable
        caption="Grey-market premium, unofficial"
        rows={data.gmp}
        rowKey={slug}
        empty="The source reports no grey-market quote for an unlisted issue on this board."
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => <IssueLink slug={r.slug} name={r.companyName} />,
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
          href: issueHref(r),
        })}
      />
    </ModuleCard>
  );
}

/** Recent listings against the issue price, from the exchange's end-of-day file. */
export function ListingsModule({ data }: { data: IpoDashboardDto }) {
  const s = data.yearStats;
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
      link={{ href: boardHref(data.board, '?status=listed'), label: 'All listings' }}
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
            cell: (r) => <IssueLink slug={r.slug} name={r.companyName} />,
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
          href: issueHref(r),
        })}
      />
    </ModuleCard>
  );
}
