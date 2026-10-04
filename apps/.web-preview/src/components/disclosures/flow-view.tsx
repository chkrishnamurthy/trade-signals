'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageDisclaimer,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import type { InstitutionalFlowDto } from '@/lib/disclosure-types';
import { DealsSection } from './flow-deals';
import { FeedChips } from './flow-feeds';
import { ShareholdingSection } from './flow-shareholding';
import { StockDrawer } from './flow-stock-drawer';
import { StocksSection } from './flow-stock-table';
import { MarketTape } from './flow-tape';
import { ScopeToggle } from './parts';

/**
 * Institutional Flow page (`/flows`).
 *
 * Three layers answer the product's three questions: the market tape (what
 * is happening), the ranked stock table (which names deserve attention), and
 * the stock drawer (why). Deals and shareholding sit below as the ledgers the
 * table rolls up. The scope toggle narrows the table, deals and shareholding
 * to followed names; the tape is market-wide by definition.
 *
 * The open stock lives in the URL (`?symbol=`), so a drawer can be linked to
 * and survives a refresh.
 */
export function FlowView({ data }: { data: InstitutionalFlowDto }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openSymbol = params.get('symbol');

  const setSymbol = useCallback(
    (symbol: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (symbol === null) next.delete('symbol');
      else next.set('symbol', symbol);
      const query = next.toString();
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const open = useCallback((symbol: string) => setSymbol(symbol), [setSymbol]);
  const close = useCallback(() => setSymbol(null), [setSymbol]);

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Institutional Flow</PageTitle>
            <PageDescription>
              Where the big money went — cash flows, futures positioning, delivery and large deals.
            </PageDescription>
          </PageHeading>
          <ScopeToggle watchlistOnly={data.watchlistOnly} hasWatchlists={data.hasWatchlists} />
        </PageHeader>

        <PageContent>
          <FeedChips feeds={data.feeds} />

          <MarketTape tape={data.tape} />
          <StocksSection
            rows={data.stocks}
            asOf={data.stocksAsOf}
            oiAsOf={data.oiAsOf}
            watchlistOnly={data.watchlistOnly}
            onOpen={open}
          />
          <DealsSection deals={data.deals} watchlistOnly={data.watchlistOnly} onOpen={open} />
          <ShareholdingSection
            rows={data.shareholding}
            hasWatchlists={data.hasWatchlists}
            onOpen={open}
          />

          <PageDisclaimer>{data.disclaimer}</PageDisclaimer>
        </PageContent>
      </PageContainer>

      <StockDrawer symbol={openSymbol} onClose={close} />
    </AppShell>
  );
}
