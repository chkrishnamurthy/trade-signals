import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BreadthView } from '@/components/markets/breadth-view';
import { MarketDataError } from '@/server/errors';
import { getMarketBreadth } from '@/server/market-breadth';

export const metadata: Metadata = {
  title: 'Market breadth',
  description:
    'Advances and declines, stocks above key averages, new highs and lows, and industry rotation.',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BreadthRoute({ searchParams }: { searchParams: SearchParams }) {
  const u = (await searchParams).u;
  const universe = u === 'nifty500' ? 'nifty500' : 'all';
  try {
    return <BreadthView data={await getMarketBreadth(universe)} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect('/login?next=%2Fmarkets%2Fbreadth');
    throw error;
  }
}
