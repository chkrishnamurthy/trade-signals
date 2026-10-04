import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
import {
  BOARD_SCOPE_LABEL,
  IPO_SCOPES,
  type IpoScope,
  overviewHref,
  sectionHref,
} from '@/lib/ipo-routes';
import type { IpoDashboardDto } from '@/lib/ipo-types';
import { IpoFeeds } from '../ipo-feeds';
import { IpoGmpNote } from '../ipo-gmp-note';
import { RememberIpoReturn } from '../ipo-return';
import { IpoSectionHeader } from '../ipo-section-header';
import { AgendaModule, AllotmentModule, DocumentsModule, FilingsModule } from './calendar-modules';
import { GmpModule, ListingsModule } from './issue-modules';
import { OpenCards } from './open-cards';
import { SectionDirectory } from './section-directory';
import { StageRail } from './stage-rail';
import { TablePreview } from './table-preview';
import { UpcomingModule } from './upcoming-module';

const SCOPE_HREFS = Object.fromEntries(IPO_SCOPES.map((s) => [s, overviewHref(s)])) as Record<
  IpoScope,
  ReturnType<typeof overviewHref>
>;

/**
 * The IPO Overview (`/ipos`), the section's front page (plan §10.0). It reads
 * top to bottom in the order a reader needs it: where every issue stands
 * (each stage opens its list), what is open now, the days ahead, what opens
 * next and what is waiting to list, the master table's first rows, then how
 * listings went, the unofficial grey market and the documents. Every block
 * ends in a link to the place that holds all of it. Facts with their sources;
 * no element applies for, bids on or rates anything.
 */
export function IpoDashboardView({ data }: { data: IpoDashboardDto }) {
  const total = Object.values(data.yearCounts).reduce((a, b) => a + b, 0);
  const showFilings = data.board !== 'sme' && data.filings.length > 0;
  return (
    <AppShell>
      <Suspense fallback={null}>
        <RememberIpoReturn
          label={data.board === 'all' ? 'IPOs' : `IPOs · ${BOARD_SCOPE_LABEL[data.board]}`}
        />
      </Suspense>
      <PageContainer>
        <IpoSectionHeader
          section="overview"
          scope={data.board}
          scopeHrefs={SCOPE_HREFS}
          asOf={data.asOf}
          counts={{ all: total }}
          description="Indian mainboard and SME issues from SEBI filing to listing day: what is open, what is next and how listings have done. Facts from the exchanges and SEBI."
        />

        <PageContent className="gap-6 pt-5">
          <IpoFeeds feeds={data.feeds} showAsOf={false} />
          <StageRail data={data} />

          {/* What is open, then what opens next and what waits to list, beside the days ahead. */}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <OpenCards data={data} />
              <UpcomingModule data={data} />
              <AllotmentModule data={data} />
            </div>
            <AgendaModule
              data={data}
              link={{ href: sectionHref('calendar', data.board), label: 'Calendar' }}
              className="lg:mt-[2.375rem]"
            />
          </div>

          <TablePreview data={data} />

          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <ListingsModule data={data} />
            {data.gmpPolicy.enabled ? <GmpModule data={data} /> : <DocumentsModule data={data} />}
          </div>

          {(data.gmpPolicy.enabled || showFilings) && (
            <div className="grid items-stretch gap-4 lg:grid-cols-2">
              {data.gmpPolicy.enabled && <DocumentsModule data={data} />}
              {showFilings && (
                <FilingsModule
                  data={data}
                  link={{ href: sectionHref('pipeline', data.board), label: 'Pipeline' }}
                />
              )}
            </div>
          )}

          <SectionDirectory data={data} />

          <p className="text-2xs text-muted-foreground">{data.coverageNote}</p>
          <IpoGmpNote gmpNote={data.gmpNote} show={data.gmpPolicy.enabled} />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
