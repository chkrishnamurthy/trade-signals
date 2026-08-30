import type { Metadata } from 'next';
import { BacktestsPage } from '@/components/backtests/backtests-page';
import { getBacktestList } from '@/server/backtests';

export const metadata: Metadata = {
  title: 'Backtests — EquityWise',
  description:
    'Historical replays of the signal engine, graded against the tape and charged real transaction costs.',
};

/** Reads stored runs on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default async function BacktestListPage() {
  return <BacktestsPage list={await getBacktestList()} />;
}
