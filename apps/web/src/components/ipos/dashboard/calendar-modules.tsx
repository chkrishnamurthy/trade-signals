import { FileTextIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { AGENDA_LABEL, BOARD_LABEL, BOARD_WORD, shortDate, shortName } from '@/lib/ipo-format';
import type {
  AgendaEventKind,
  IpoAllotmentRowDto,
  IpoDashboardDto,
  SebiFilingDto,
} from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { ExternalLink, IssueLink, ModuleCard, ModuleTable } from '../module-card';

const KIND_TEXT: Readonly<Record<AgendaEventKind, string>> = {
  opens: 'text-bullish-strong',
  closes: 'text-warning-foreground dark:text-warning',
  allotment: 'text-info-strong',
  refunds: 'text-muted-foreground',
  demat_credit: 'text-muted-foreground',
  listing: 'text-bullish-strong',
};

const issueHref = (slug: string) => `/ipos/${slug}` as Route;

/** `Mon` over `5 Oct`; `Today` for today. */
function DayLabel({ date, today }: { date: string; today: string }) {
  const short = shortDate(date);
  return (
    <span className="flex items-baseline gap-1.5 sm:flex-col sm:gap-0">
      <span className={cn('font-semibold text-sm', date === today && 'text-primary')}>
        {date === today ? 'Today' : short.slice(0, 3)}
      </span>
      <span className="text-muted-foreground text-xs">{short.slice(4)}</span>
    </span>
  );
}

const KIND_ORDER: readonly AgendaEventKind[] = [
  'opens',
  'closes',
  'allotment',
  'refunds',
  'demat_credit',
  'listing',
];

/** A day's events, one line per kind: `Listing AceVector*, Orient Cables*`. */
function groupByKind(events: IpoDashboardDto['agenda'][number]['events']) {
  return KIND_ORDER.flatMap((kind) => {
    const list = events.filter((e) => e.kind === kind);
    return list.length === 0 ? [] : [{ kind, events: list }];
  });
}

/** The next five trading days as an agenda — it reads the same at phone width. */
export function AgendaModule({ data }: { data: IpoDashboardDto }) {
  const board = BOARD_WORD[data.board];
  const expected = data.agenda.some((d) => d.events.some((e) => e.expected));
  return (
    <ModuleCard
      id="ipo-agenda"
      title="Next five days"
      note="Openings, closings, allotment, share credit and listing over the next five trading days."
      footer={
        <>
          {expected && (
            <span className="block">
              * Expected, from SEBI&apos;s T+3 timetable, until the exchange confirms the date.
            </span>
          )}
          <span className="block">
            {BOARD_LABEL[data.board]} issues only — switch the board above for the other.
          </span>
        </>
      }
    >
      {data.agenda.length === 0 ? (
        <p className="border-border border-t px-4 py-6 text-center text-muted-foreground text-sm">
          No {board} IPO milestone in the next five trading days.
        </p>
      ) : (
        <ol className="flex flex-col border-border border-t">
          {data.agenda.map((day) => (
            <li
              key={day.date}
              className="grid gap-1.5 border-border border-b px-4 py-2.5 last:border-0 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-3"
            >
              <DayLabel date={day.date} today={data.today} />
              <ul className="flex min-w-0 flex-col gap-1">
                {groupByKind(day.events).map((group) => (
                  <li key={group.kind} className="text-sm leading-6">
                    <span className={cn('mr-1.5 font-semibold', KIND_TEXT[group.kind])}>
                      {AGENDA_LABEL[group.kind]}
                    </span>
                    {group.events.map((event, i) => (
                      <span key={event.slug}>
                        <Link
                          href={issueHref(event.slug)}
                          title={event.companyName}
                          className="text-foreground underline-offset-4 hover:underline"
                        >
                          {shortName(event.companyName)}
                        </Link>
                        {event.expected && <span className="text-muted-foreground">*</span>}
                        {i < group.events.length - 1 && (
                          <span className="text-muted-foreground">, </span>
                        )}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </ModuleCard>
  );
}

/**
 * Where allotment stands. Only a STATED date that has come reads "Out"; a day
 * computed from the T+3 timetable stays expected (`*`) even once it has
 * passed — no source has confirmed the allotment, so EquityWise does not say
 * it happened. `casing: 'inline'` starts lowercase for use mid-sentence.
 */
function allotmentText(
  row: IpoAllotmentRowDto,
  today: string,
  casing: 'start' | 'inline' = 'start',
): string {
  if (row.allotmentDate === null) return '—';
  const star = row.allotmentExpected ? '*' : '';
  if (row.allotmentDate > today) return `${shortDate(row.allotmentDate)}${star}`;
  const day = shortDate(row.allotmentDate).slice(4);
  const word = row.allotmentExpected ? 'Due' : 'Out ·';
  return `${casing === 'inline' ? word.toLowerCase() : word} ${day}${star}`;
}

const listsText = (row: IpoAllotmentRowDto) =>
  row.listingDate === null ? '—' : `${shortDate(row.listingDate)}${row.listingExpected ? '*' : ''}`;

/**
 * Where an applicant checks allotment: the registrar's own page, or the
 * exchange's. EquityWise never looks an application up or fills those forms in.
 */
export function AllotmentModule({ data }: { data: IpoDashboardDto }) {
  const expected = data.allotment.some((r) => r.allotmentExpected || r.listingExpected);
  return (
    <ModuleCard
      id="ipo-allotment"
      title="Allotment status"
      note="Check an application on the registrar's own site, or on the exchange's."
      footer={
        <>
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {data.exchangeAllotment.map((l) => (
              <ExternalLink key={l.url} href={l.url}>
                {l.label}
              </ExternalLink>
            ))}
          </span>
          {expected && (
            <span className="mt-1 block">* Expected, from SEBI&apos;s T+3 timetable.</span>
          )}
        </>
      }
    >
      <ModuleTable
        caption="Allotment status"
        rows={data.allotment}
        rowKey={(r) => r.slug}
        empty="No closed issue on this board is waiting for allotment or listing."
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => <IssueLink slug={r.slug} name={r.companyName} />,
          },
          {
            id: 'allotment',
            header: 'Allotment',
            width: 'w-28',
            cell: (r) => <span className="text-xs">{allotmentText(r, data.today)}</span>,
          },
          {
            id: 'lists',
            header: 'Lists',
            width: 'w-24',
            cell: (r) => <span className="text-muted-foreground text-xs">{listsText(r)}</span>,
          },
          {
            id: 'check',
            header: 'Check',
            width: 'w-24',
            align: 'end',
            cell: (r) =>
              r.registrarUrl === null ? (
                <span className="text-muted-foreground text-xs" title={r.registrarName ?? ''}>
                  {r.registrarName === null ? '—' : 'No link'}
                </span>
              ) : (
                <span title={r.registrarName ?? undefined}>
                  <ExternalLink href={r.registrarUrl} className="text-xs">
                    Registrar
                  </ExternalLink>
                </span>
              ),
          },
        ]}
        mobile={(r) => ({
          title: r.companyName,
          sub: `Allotment ${allotmentText(r, data.today, 'inline')} · lists ${listsText(r)}`,
          href: r.registrarUrl ?? issueHref(r.slug),
          external: r.registrarUrl !== null,
        })}
      />
    </ModuleCard>
  );
}

const DOC_KIND: Readonly<Record<string, string>> = {
  rhp: 'RHP',
  drhp: 'DRHP',
};

/** Offer documents of the issues still ahead, always the exchange's own copy. */
export function DocumentsModule({ data }: { data: IpoDashboardDto }) {
  return (
    <ModuleCard
      id="ipo-documents"
      title="Offer documents"
      note="Red Herring Prospectuses of open and upcoming issues. Read the Risk Factors before investing."
      footer="Linked where the exchange hosts them — never copied or re-hosted."
    >
      {data.documents.length === 0 ? (
        <p className="border-border border-t px-4 py-6 text-center text-muted-foreground text-sm">
          No open or upcoming issue has an offer document published yet.
        </p>
      ) : (
        <ul className="grid gap-2.5 border-border border-t p-4 sm:grid-cols-2">
          {data.documents.map((d) => (
            <li
              key={d.url}
              className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-3"
            >
              <span className="flex min-w-0 items-center gap-2 font-semibold text-sm">
                <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <IssueLink slug={d.slug} name={d.companyName} />
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {DOC_KIND[d.kind] ?? d.kind}
                {d.url.endsWith('.zip') ? ' · zip' : d.url.endsWith('.pdf') ? ' · PDF' : ''} ·{' '}
                {d.host}
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <ExternalLink href={d.url}>Open the {DOC_KIND[d.kind] ?? 'document'}</ExternalLink>
                {d.sectionsQuoted > 0 && (
                  <Link
                    href={`${issueHref(d.slug)}#company` as Route}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {d.sectionsQuoted} section{d.sectionsQuoted === 1 ? '' : 's'} quoted
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ModuleCard>
  );
}

/** A filing's company, linked to its issue only when exactly one issue matched it. */
function FilingName({ filing }: { filing: SebiFilingDto }) {
  return filing.slug === null ? (
    <span className="block truncate font-medium" title={filing.companyName}>
      {filing.companyName}
    </span>
  ) : (
    <IssueLink slug={filing.slug} name={filing.companyName} />
  );
}

/** DRHPs filed with SEBI — regulator data, never an announced issue. */
export function FilingsModule({ data }: { data: IpoDashboardDto }) {
  return (
    <ModuleCard
      id="ipo-filings"
      title="Filed with SEBI"
      note="Draft offer documents, newest first. A filing comes months before an issue opens, and many never do."
      footer="From sebi.gov.in. SME issues file their drafts with the exchange instead."
    >
      <ModuleTable
        caption="Draft offer documents filed with SEBI"
        rows={data.filings}
        rowKey={(f) => f.sebiId}
        empty="No filing collected yet."
        columns={[
          {
            id: 'filed',
            header: 'Filed',
            width: 'w-20',
            cell: (f) => (
              <span className="text-muted-foreground text-xs">
                {shortDate(f.filedDate).slice(4)}
              </span>
            ),
          },
          { id: 'company', header: 'Company', cell: (f) => <FilingName filing={f} /> },
          {
            id: 'doc',
            header: 'Document',
            width: 'w-36',
            align: 'end',
            cell: (f) => (
              <ExternalLink href={f.pageUrl} className="text-xs">
                {f.documentLabel ?? 'Filing'}
              </ExternalLink>
            ),
          },
        ]}
        mobile={(f) => ({
          title: f.companyName,
          sub: `${f.documentLabel ?? 'Filing'} · filed ${shortDate(f.filedDate).slice(4)}`,
          href: f.pageUrl,
          external: true,
        })}
      />
    </ModuleCard>
  );
}
