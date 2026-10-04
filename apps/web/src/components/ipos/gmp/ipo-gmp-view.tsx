import { EmptyState } from '@/components/data-display/states';
import { Card } from '@/components/ui/card';
import { signedPercent } from '@/lib/format';
import {
  BOARD_LABEL,
  gmpText,
  istDayTime,
  shortDate,
  statusParts,
  trackSpan,
} from '@/lib/ipo-format';
import { sectionHref } from '@/lib/ipo-routes';
import type { GmpTrackRecordDto, IpoGmpPageDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { CompanyCell } from '../ipo-cells';
import { StateChip, UnofficialTag } from '../ipo-chip';
import { sharePrice } from '../ipo-figures';
import { IpoGmpNote } from '../ipo-gmp-note';
import { IpoSectionPage } from '../ipo-section-page';
import { IssueLink, ModuleCard, ModuleTable } from '../module-card';

const OUTCOME: Readonly<Record<string, string>> = {
  within: 'Within range',
  gmp_above: 'Quote above',
  gmp_below: 'Quote below',
};

/** One board's record: how close the last quote before listing came to the listing-day gain. */
function TrackRecord({ track, mixed }: { track: GmpTrackRecordDto; mixed: boolean }) {
  const board = track.board === null ? '' : BOARD_LABEL[track.board];
  return (
    <ModuleCard
      id={`gmp-track-${track.board ?? 'all'}`}
      title={`Track record${mixed && board !== '' ? ` · ${board}` : ''}`}
      note={`${trackSpan(track)}: the last quote before listing against the listing-day gain. "Within range" is ±${track.tolerancePoints} points.`}
      aside={<UnofficialTag />}
      unofficial
      footer={
        track.total === 0
          ? 'No listing with a recorded quote yet.'
          : `${track.within} of ${track.total} within ±${track.tolerancePoints} points · quote above the gain ${track.gmpAbove} · below ${track.gmpBelow}. Past accuracy does not indicate future results.`
      }
    >
      <ModuleTable
        caption={`GMP track record${board === '' ? '' : `, ${board}`}`}
        rows={track.rows}
        rowKey={(r) => r.slug}
        empty="No listing with a recorded quote yet."
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => <IssueLink slug={r.slug} name={r.companyName} />,
          },
          {
            id: 'listed',
            header: 'Listed',
            width: 'w-24',
            cell: (r) => (
              <span className="figure text-muted-foreground text-xs">
                {shortDate(r.listingDate).slice(4)}
              </span>
            ),
          },
          {
            id: 'quote',
            header: 'Last quote',
            width: 'w-24',
            align: 'end',
            cell: (r) => <span className="figure">{signedPercent(r.lastGmpPercent)}</span>,
          },
          {
            id: 'gain',
            header: 'Listing day',
            width: 'w-24',
            align: 'end',
            cell: (r) => <span className="figure">{signedPercent(r.listingGainPercent)}</span>,
          },
          {
            id: 'outcome',
            header: 'Difference',
            width: 'w-32',
            align: 'end',
            cell: (r) => (
              <span className="inline-flex flex-col items-end">
                <span className="figure text-xs">
                  {r.differencePoints > 0 ? '+' : ''}
                  {r.differencePoints.toFixed(1)} pts
                </span>
                <span
                  className={cn(
                    'text-2xs',
                    r.outcome === 'within' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {OUTCOME[r.outcome]}
                </span>
              </span>
            ),
          },
        ]}
        mobile={(r) => ({
          title: r.companyName,
          sub: `Listed ${shortDate(r.listingDate).slice(4)} · ${OUTCOME[r.outcome]}`,
          value: <span className="figure">{signedPercent(r.lastGmpPercent)}</span>,
          valueSub: `day 1 ${signedPercent(r.listingGainPercent)}`,
          href: `/ipos/${r.slug}`,
        })}
      />
    </ModuleCard>
  );
}

/**
 * The grey-market premium (`/ipos/gmp`), fenced off in amber: what one website
 * reports as the premium over the upper band for unlisted issues, and how its
 * last quote compared with real listings, board by board. It is never coloured
 * as a gain, never mixed with an official figure and never called a forecast.
 */
export function IpoGmpView({ data }: { data: IpoGmpPageDto }) {
  const mixed = data.board === 'all';
  const latest = data.quotes
    .map((r) => r.gmp?.observedAt ?? '')
    .sort()
    .at(-1);
  return (
    <IpoSectionPage
      section="gmp"
      scope={data.board}
      scopeHref={(s) => sectionHref('gmp', s)}
      feeds={data.feeds}
      rememberLabel="Grey market"
      description="The grey-market premium as one website reports it: unofficial, unverified, and not a forecast of any listing. Kept apart from every exchange figure."
    >
      {!data.gmpPolicy.enabled ? (
        <Card>
          <EmptyState
            title="The grey-market source is switched off"
            description="EquityWise shows no GMP while its source is off. Every exchange figure is unaffected."
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden border-warning-line" aria-labelledby="gmp-quotes">
            <header className="flex flex-wrap items-start justify-between gap-3 bg-warning-soft/40 px-4 pt-3.5 pb-3">
              <div className="min-w-0">
                <h2 id="gmp-quotes" className="font-semibold text-sm tracking-tight">
                  Latest quotes for unlisted issues
                </h2>
                <p className="text-muted-foreground text-xs">
                  Source: {data.gmpPolicy.sourceName}
                  {latest !== undefined &&
                    latest !== '' &&
                    ` · latest report ${istDayTime(latest)} IST`}
                  {data.gmpPolicy.trackedSince !== null &&
                    ` · recorded by EquityWise since ${shortDate(data.gmpPolicy.trackedSince)}`}
                </p>
              </div>
              <UnofficialTag />
            </header>
            <ModuleTable
              caption="Grey-market premium, unofficial"
              rows={data.quotes}
              rowKey={(r) => r.slug}
              empty="The source reports no quote for an unlisted issue in view."
              columns={[
                {
                  id: 'company',
                  header: 'Company',
                  cell: (r) => <CompanyCell row={r} showBoard={mixed} className="max-w-64" />,
                },
                {
                  id: 'stage',
                  header: 'Stage',
                  width: 'w-40',
                  cell: (r) => {
                    const s = statusParts(r, data.today);
                    return (
                      <span className="flex flex-col items-start gap-0.5">
                        <StateChip tone={s.tone} dot>
                          {s.chip}
                        </StateChip>
                        {s.note !== null && (
                          <span className="text-2xs text-muted-foreground">{s.note}</span>
                        )}
                      </span>
                    );
                  },
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
                  width: 'w-40',
                  align: 'end',
                  cell: (r) =>
                    r.gmp === null ? (
                      '—'
                    ) : (
                      <span
                        className={cn(
                          'figure whitespace-nowrap',
                          r.gmp.stale && 'text-subtle-foreground',
                        )}
                        title={r.gmp.stale ? 'Reported more than a day and a half ago' : undefined}
                      >
                        {gmpText(r.gmp)}
                      </span>
                    ),
                },
                {
                  id: 'when',
                  header: 'Reported',
                  width: 'w-32',
                  align: 'end',
                  cell: (r) => (
                    <span className="text-muted-foreground text-xs">
                      {r.gmp === null ? '—' : istDayTime(r.gmp.observedAt)}
                      {r.gmp?.stale ? ' · stale' : ''}
                    </span>
                  ),
                },
              ]}
              mobile={(r) => ({
                title: r.companyName,
                sub: `${statusParts(r, data.today).chip} · upper band ${sharePrice(r.priceBand?.highPaise ?? null)}`,
                value: <span className="figure">{r.gmp === null ? '—' : gmpText(r.gmp)}</span>,
                valueSub: r.gmp === null ? '' : istDayTime(r.gmp.observedAt),
                href: `/ipos/${r.slug}`,
              })}
            />
          </Card>

          <div className={cn('grid items-start gap-4', data.tracks.length > 1 && 'lg:grid-cols-2')}>
            {data.tracks.map((t) => (
              <TrackRecord key={t.board ?? 'all'} track={t} mixed={mixed} />
            ))}
          </div>
        </>
      )}
      <IpoGmpNote gmpNote={data.gmpNote} show />
    </IpoSectionPage>
  );
}
