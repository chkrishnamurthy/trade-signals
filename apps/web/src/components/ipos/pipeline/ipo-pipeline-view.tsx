import { Card } from '@/components/ui/card';
import { sectionHref, tableHref } from '@/lib/ipo-routes';
import type { IpoPipelinePageDto } from '@/lib/ipo-types';
import { DocumentsModule, FilingsModule } from '../dashboard/calendar-modules';
import { SmeMark } from '../ipo-cells';
import { IssueSizeText } from '../ipo-figures';
import { IpoSectionPage } from '../ipo-section-page';
import { IssueLink, ModuleCard, ModuleTable } from '../module-card';

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-surface px-3.5 py-3 shadow-subtle">
      <span className="truncate text-muted-foreground text-xs">{label}</span>
      <span className="figure font-medium text-2xl tracking-tight">{value}</span>
      <span className="text-2xs text-muted-foreground">{hint}</span>
    </div>
  );
}

/**
 * What may come to market (`/ipos/pipeline`): draft offer documents filed with
 * SEBI — months before an issue, and many never become one — issues announced
 * without dates, and the offer documents of the issues still ahead. Regulator
 * and exchange facts only; a filing is never shown as an issue.
 */
export function IpoPipelineView({ data }: { data: IpoPipelinePageDto }) {
  const mixed = data.board === 'all';
  return (
    <IpoSectionPage
      section="pipeline"
      scope={data.board}
      scopeHref={(s) => sectionHref('pipeline', s)}
      feeds={data.feeds}
      rememberLabel="IPO pipeline"
      description="Companies that may come to market: draft prospectuses filed with SEBI, issues announced without dates, and the offer documents of issues still ahead."
    >
      <section
        aria-label="The pipeline in figures"
        className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3"
      >
        <Figure
          label="Filed with SEBI"
          value={data.filedRecently === null ? '—' : String(data.filedRecently)}
          hint={
            data.filingsOn
              ? `draft prospectuses, last ${data.filedDays} days`
              : data.board === 'sme'
                ? 'SME drafts are filed with the exchange'
                : 'SEBI filings are not being collected'
          }
        />
        <Figure
          label="Announced, no dates"
          value={String(data.undated.length)}
          hint="upcoming issues without a bidding window"
        />
        <Figure
          label="Offer documents"
          value={String(data.documents.length)}
          hint="of open and upcoming issues"
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ModuleCard
          id="ipo-undated"
          title="Announced, dates not set"
          note="Issues the exchange has listed as upcoming without a bidding window yet."
          link={
            data.undated.length > 0
              ? { href: tableHref(data.board, { status: 'upcoming' }), label: 'All upcoming' }
              : undefined
          }
        >
          <ModuleTable
            caption="Upcoming issues without dates"
            rows={data.undated}
            rowKey={(r) => r.slug}
            empty="Every announced issue has its dates."
            columns={[
              {
                id: 'company',
                header: 'Company',
                cell: (r) => (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <IssueLink slug={r.slug} name={r.companyName} />
                    {mixed && r.board === 'sme' && <SmeMark />}
                  </span>
                ),
              },
              {
                id: 'size',
                header: 'Issue size',
                width: 'w-28',
                align: 'end',
                cell: (r) => <IssueSizeText item={r} />,
              },
            ]}
            mobile={(r) => ({
              title: r.companyName,
              sub: 'Dates not announced',
              value: <IssueSizeText item={r} />,
              href: `/ipos/${r.slug}`,
            })}
          />
        </ModuleCard>
        <DocumentsModule data={data} />
      </div>

      {data.filingsOn ? (
        <FilingsModule data={data} />
      ) : (
        <Card className="px-4 py-6 text-center text-muted-foreground text-sm">
          {data.board === 'sme'
            ? 'SME issues file their draft documents with the exchange, not SEBI, so there is no SEBI list for SME. Choose All boards or Mainboard above.'
            : 'SEBI filings are not being collected right now.'}
        </Card>
      )}
      <p className="text-2xs text-muted-foreground">
        A draft filing is regulator data, not an announced issue: it comes months before any
        bidding, and many filings never become an issue. {data.coverageNote}
      </p>
    </IpoSectionPage>
  );
}
