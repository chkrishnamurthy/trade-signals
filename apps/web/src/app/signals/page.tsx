import type { Metadata } from 'next';
import { SignalsPage } from '@/components/signals/signals-page';

export const metadata: Metadata = {
  title: 'Intraday signals — WealthOS',
  description:
    "Technical setups forming in today's session, each scored on how many independent conditions agree.",
};

/** Reads the live signal store on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default function TradeSignalsPage() {
  return <SignalsPage />;
}
