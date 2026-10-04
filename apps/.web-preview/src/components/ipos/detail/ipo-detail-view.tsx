import type { Route } from 'next';
import type * as React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { BOARD_LABEL, istDayTime, nextMilestone, stateLabel } from '@/lib/ipo-format';
import type { IpoDetailDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { StateChip } from '../ipo-chip';
import { IpoGmpNote } from '../ipo-gmp-note';
import { IpoBackLink } from '../ipo-return';
import { GmpPanel } from './gmp-panel';
import { IpoDocuments } from './ipo-documents';
import { IpoKeyFacts } from './ipo-key-facts';
import { IpoKeyFigures } from './ipo-key-figures';
import { IpoLimits } from './ipo-limits';
import { IpoListing, IpoNotListedOnNse } from './ipo-listing';
import { IpoAllotmentLinks, IpoParticipants } from './ipo-participants';
import { IpoRhp } from './ipo-rhp';
import { IpoSources } from './ipo-sources';
import { IpoSubscription } from './ipo-subscription';
import { IpoTimeline } from './ipo-timeline';

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-sunken px-2 py-0.5 text-2xs text-muted-foreground ring-1 ring-border ring-inset">
      {children}
    </span>
  );
}

/** On a phone: jump links to the long page's main sections. */
function SectionNav({ hasListing }: { hasListing: boolean }) {
  const links = [
    { href: '#details', label: 'Details' },
    { href: '#timeline', label: 'Timeline' },
    hasListing
      ? { href: '#listing', label: 'Listing' }
      : { href: '#subscription', label: 'Subscription' },
    { href: '#company', label: 'Company' },
    { href: '#allotment', label: 'Allotment' },
  ];
  return (
    <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4 lg:hidden">
      <ul className="flex w-max gap-1.5">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-3 text-sm hover:bg-accent"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Below `lg` the two columns dissolve and each card takes its place in one reading order. */
const at = (order: string) => cn(order, 'lg:order-none');

/**
 * One IPO in full (`/ipos/[slug]`, plan §10.2): the key figures, the issue's
 * terms, its timeline, what each category's application costs, demand by
 * category, the RHP's own words — and, fenced off in amber, the unofficial
 * grey-market premium. A main column and a sidebar from `lg`; one column in
 * the mockup's order below. No element applies for, bids on or rates anything.
 */
export function IpoDetailView({ ipo, today }: { ipo: IpoDetailDto; today: string }) {
  const state = stateLabel(ipo, today);
  const exchange = ipo.designatedExchange ?? ipo.exchanges[0] ?? 'Exchange';
  const back = {
    fallbackHref: `/ipos/${ipo.board}` as Route,
    fallbackLabel: `${BOARD_LABEL[ipo.board]} IPOs`,
  };
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading className="gap-2">
            <IpoBackLink {...back} className="mb-1" />
            <div className="flex flex-wrap items-center gap-1.5">
              <StateChip tone={state.tone} dot>
                {state.label}
              </StateChip>
              <Tag>{BOARD_LABEL[ipo.board]}</Tag>
              <Tag>
                {ipo.exchanges.join(' + ') || exchange}
                {ipo.nseSymbol !== null && ` · ${ipo.nseSymbol}`}
              </Tag>
              {ipo.issueMethod !== null && (
                <Tag>
                  {ipo.issueMethod === 'fixed_price' ? 'Fixed-price issue' : 'Book-built issue'}
                </Tag>
              )}
            </div>
            <PageTitle className="whitespace-normal text-balance">{ipo.companyName} IPO</PageTitle>
            <PageDescription>
              {ipo.status === 'open' && ipo.upiCutoffAt !== null ? (
                <>
                  Bidding is open. The UPI mandate must be accepted by{' '}
                  <strong className="font-semibold text-foreground">
                    {istDayTime(ipo.upiCutoffAt)} IST
                  </strong>
                  .
                </>
              ) : (
                nextMilestone(ipo, today)
              )}
            </PageDescription>
          </PageHeading>
        </PageHeader>

        <PageContent>
          <IpoKeyFigures ipo={ipo} />
          <SectionNav hasListing={ipo.listing !== null} />

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
              <div className={at('order-1')}>
                <IpoKeyFacts ipo={ipo} />
              </div>
              <div className={at('order-2')}>
                <IpoTimeline ipo={ipo} today={today} />
              </div>
              {ipo.listing !== null && (
                <div className={at('order-3')}>
                  <IpoListing listing={ipo.listing} />
                </div>
              )}
              {ipo.listing === null && ipo.closedStage === 'listing_unconfirmed' && (
                <div className={at('order-3')}>
                  <IpoNotListedOnNse
                    expectedListing={ipo.timeline.find((e) => e.kind === 'listing')?.date ?? null}
                  />
                </div>
              )}
              {ipo.investmentLimits.length > 0 && ipo.listing === null && (
                <div className={at('order-4')}>
                  <IpoLimits ipo={ipo} />
                </div>
              )}
              <div className={at('order-5')}>
                <IpoSubscription ipo={ipo} />
              </div>
              <div className={at('order-7')}>
                <IpoRhp
                  extracts={ipo.rhp}
                  documents={ipo.documents}
                  openDate={ipo.openDate}
                  readFrom={ipo.rhpReadFrom}
                />
              </div>
            </div>
            <aside
              aria-label="Quick facts"
              className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4"
            >
              <div className={at('order-6')}>
                <GmpPanel
                  gmp={ipo.gmpPanel}
                  track={ipo.gmpTrackRecord}
                  upperBandPaise={ipo.priceBand?.highPaise ?? null}
                />
              </div>
              <div className={at('order-8')}>
                <IpoAllotmentLinks ipo={ipo} today={today} />
              </div>
              <div className={at('order-9')}>
                <IpoParticipants ipo={ipo} />
              </div>
              <div className={at('order-10')}>
                <IpoDocuments documents={ipo.documents} filings={ipo.filings} exchange={exchange} />
              </div>
              <div className={at('order-11')}>
                <IpoSources ipo={ipo} />
              </div>
            </aside>
          </div>

          {/* The page runs long on a phone: the way back is here too, not only at the top. */}
          <IpoBackLink {...back} />

          <IpoGmpNote gmpNote={ipo.gmpNote} show />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
