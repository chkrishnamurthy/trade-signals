import type { Metadata } from 'next';
import { MarketDashboard } from '@/components/market-dashboard';

export const metadata: Metadata = {
  title: 'NIFTY 50 — NSE Signal Platform',
  description: 'Live NIFTY 50 constituent prices from Fyers.',
};

/** Live market data; never prerender. */
export const dynamic = 'force-dynamic';

export default function Nifty50Page() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <MarketDashboard indexKey="nifty50" title="NIFTY 50" />
    </main>
  );
}
