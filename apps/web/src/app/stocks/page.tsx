import type { Metadata } from 'next';
import { StocksPage } from '@/components/stocks/stocks-page';

export const metadata: Metadata = {
  title: 'All stocks — EquityWise',
  description:
    "Every NSE name we track, with today's price and its daily technical readings. Filter by sector to compare like with like.",
};

/** Reads live quotes on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default function StocksRoute() {
  return <StocksPage />;
}
