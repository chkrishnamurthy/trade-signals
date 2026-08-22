import type { Metadata } from 'next';
import { SignalsPage } from '@/components/signals/signals-page';

export const metadata: Metadata = {
  title: 'Intraday trade signals — NSE Signal Platform',
  description:
    'Same-day intraday technical setups across the NIFTY 50, scored on confluence and explained factor by factor. Decision support, not advice.',
};

/** Reads the live signal store on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default function TradeSignalsPage() {
  return <SignalsPage />;
}
