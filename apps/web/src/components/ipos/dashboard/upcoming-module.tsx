import { shortDate } from '@/lib/ipo-format';
import { issueHref, tableHref } from '@/lib/ipo-routes';
import type { IpoDashboardDto, IpoListItemDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { SmeMark } from '../ipo-cells';
import { bandText, IssueSizeText, sharePrice } from '../ipo-figures';
import { IssueLink, ModuleCard, ModuleTable } from '../module-card';

/** How many upcoming issues the Overview lists. */
const SHOWN = 5;

/** The opening day as a small calendar leaf; "TBA" when no date is announced. */
function DateLeaf({ date }: { date: string | null }) {
  const short = date === null ? null : shortDate(date);
  return (
    <span
      aria-hidden
      className={cn(
        'flex w-10 shrink-0 flex-col items-center rounded-md py-0.5 leading-tight ring-1 ring-inset',
        date === null
          ? 'bg-surface-sunken text-muted-foreground ring-border'
          : 'bg-info-soft text-info-strong ring-info-line',
      )}
    >
      <span className="font-semibold text-[0.6rem] uppercase">
        {short === null ? 'TBA' : short.slice(-3)}
      </span>
      <span className="figure font-semibold text-sm">
        {short === null ? '—' : short.split(' ')[1]}
      </span>
    </span>
  );
}

/** Bidding dates and band in one line: `Wed 7 – Fri 9 Oct · ₹495 – ₹521`. */
function when(row: IpoListItemDto): string {
  const dates =
    row.openDate === null
      ? 'Dates not announced'
      : row.closeDate === null
        ? `Opens ${shortDate(row.openDate)}`
        : `${shortDate(row.openDate).slice(0, -4)} – ${shortDate(row.closeDate)}`;
  return row.priceBand === null
    ? `${dates} · band awaited`
    : `${dates} · ${bandText(row.priceBand)}`;
}

/** Announced issues not yet open, the next to open first. */
export function UpcomingModule({ data }: { data: IpoDashboardDto }) {
  const rows = data.upcoming.slice(0, SHOWN);
  const mixed = data.board === 'all';
  return (
    <ModuleCard
      id="ipo-upcoming"
      title="Opening soon"
      note="Announced issues, the next to open first. A band is often published only days before."
      link={
        data.upcoming.length > 0
          ? { href: tableHref(data.board, { status: 'upcoming' }), label: 'All upcoming' }
          : undefined
      }
    >
      <ModuleTable
        caption="Upcoming IPOs"
        rows={rows}
        rowKey={(r) => r.slug}
        empty="No issue has been announced yet."
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => (
              <span className="flex min-w-0 items-center gap-2.5">
                <DateLeaf date={r.openDate} />
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <IssueLink slug={r.slug} name={r.companyName} />
                    {mixed && r.board === 'sme' && <SmeMark />}
                  </span>
                  <span className="truncate text-2xs text-muted-foreground">{when(r)}</span>
                </span>
              </span>
            ),
          },
          {
            id: 'min',
            header: 'Min. investment',
            width: 'w-32',
            align: 'end',
            cell: (r) =>
              r.minInvestmentPaise === null ? (
                <span className="text-xs">
                  <IssueSizeText item={r} />
                </span>
              ) : (
                <span className="figure font-medium">{sharePrice(r.minInvestmentPaise)}</span>
              ),
          },
        ]}
        mobile={(r) => ({
          title: r.companyName,
          sub: when(r),
          value:
            r.minInvestmentPaise === null ? (
              <IssueSizeText item={r} />
            ) : (
              <span className="figure font-medium">{sharePrice(r.minInvestmentPaise)}</span>
            ),
          valueSub: r.minInvestmentPaise === null ? 'issue size' : 'min. investment',
          href: issueHref(r.slug),
        })}
      />
    </ModuleCard>
  );
}
