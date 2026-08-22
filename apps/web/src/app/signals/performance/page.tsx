import type { Metadata } from 'next';
import { PerformanceView } from '@/components/signals/performance-view';
import { getPaperResults } from '@/server/paper-trades';

export const metadata: Metadata = {
  title: 'Signal accuracy — NSE Signal Platform',
  description:
    'Paper-traded outcomes of every intraday signal that triggered, charged real transaction costs. Measurement, not advice.',
};

/** Reads recorded outcomes on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default async function SignalAccuracyPage() {
  const results = await getPaperResults();
  return <PerformanceView results={results} />;
}
