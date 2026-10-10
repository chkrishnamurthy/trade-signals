import type { Metadata } from 'next';
import { MarketBriefView } from '@/components/market-brief/market-brief-view';
import { getMarketBrief } from '@/server/market-brief';

export const metadata: Metadata = {
  title: 'Market Brief',
  description: 'A technical summary of the latest completed NSE session.',
  robots: { index: false, follow: false },
};

/** Reads per-user data on every request; never prerender. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TodayRoute({ searchParams }: { searchParams: SearchParams }) {
  const requested = (await searchParams).u;
  const universe = requested === 'nifty500' ? 'nifty500' : 'all';
  const response = await getMarketBrief(universe);
  return <MarketBriefView {...response} />;
}
