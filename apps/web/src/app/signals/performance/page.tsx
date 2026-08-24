import type { Metadata } from 'next';
import { PerformanceView } from '@/components/signals/performance-view';
import { getPaperResults } from '@/server/paper-trades';

export const metadata: Metadata = {
  title: 'Signal performance — WealthOS',
  description:
    'How past signals actually turned out once graded against the tape and charged real transaction costs.',
};

/** Reads recorded outcomes on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default async function SignalAccuracyPage() {
  const results = await getPaperResults();
  return <PerformanceView results={results} />;
}
