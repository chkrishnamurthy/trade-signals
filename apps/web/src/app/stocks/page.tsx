import type { Metadata } from 'next';
import { StocksPage } from '@/components/stocks/stocks-page';

export const metadata: Metadata = {
  title: 'Stocks — WealthOS',
  description:
    'Every NSE constituent we track, with its latest quote and daily indicators, filterable by sector. Decision support, not advice.',
};

/** Reads live quotes on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default function StocksRoute() {
  return <StocksPage />;
}
