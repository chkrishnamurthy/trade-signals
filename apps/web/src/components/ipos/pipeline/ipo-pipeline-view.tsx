import { Card } from '@/components/ui/card';
import { sectionHref, tableHref } from '@/lib/ipo-routes';
import type { IpoPipelinePageDto } from '@/lib/ipo-types';
import { DocumentsModule, FilingsModule } from '../dashboard/calendar-modules';
import { SmeMark } from '../ipo-cells';
import { IssueSizeText } from '../ipo-figures';
import { IpoSectionPage } from '../ipo-section-page';
import { IssueLink, ModuleCard, ModuleTable } from '../module-card';

/**
 * What may come to market (`/ipos/pipeline`): the offer documents of issues
 * still ahead, issues announced without dates (only when there are any), and
 * the latest draft offer documents filed with SEBI — months before an issue,
 * and many never become one. Regulator and exchange facts only; a filing is
 * never shown as an issue.
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
      description="Companies that may come to market: the offer documents of issues still ahead and the draft prospectuses filed with SEBI."
    >
      <div className={data.undated.length > 0 ? 'grid items-start gap-4 lg:grid-cols-2' : ''}>
        <DocumentsModule data={data} />
        {data.undated.length > 0 && (
          <ModuleCard
            id="ipo-undated"
            title="Announced, dates not set"
            note="Issues the exchange lists as upcoming without a bidding window yet."
            link={{ href: tableHref(data.board, { status: 'upcoming' }), label: 'All upcoming' }}
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
        )}
      </div>

      {data.filingsOn ? (
        <div className="flex flex-col gap-2">
          <FilingsModule data={data} />
          <p className="text-2xs text-muted-foreground">
            The latest {data.filings.length} filings
            {data.filedRecently === null
              ? '.'
              : `; ${data.filedRecently} were filed in the last ${data.filedDays} days.`}
          </p>
        </div>
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
