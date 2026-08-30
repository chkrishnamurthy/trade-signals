import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BacktestDetail } from '@/components/backtests/backtest-detail';
import { getBacktestDetail } from '@/server/backtests';

export const metadata: Metadata = {
  title: 'Backtest run — EquityWise',
  description: 'What the engine would have done, and what the tape did with it.',
};

export const dynamic = 'force-dynamic';

export default async function BacktestRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) notFound();

  const detail = await getBacktestDetail(numeric);
  if (detail.run === null) notFound();

  return <BacktestDetail detail={detail} />;
}
