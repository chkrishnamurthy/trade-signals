import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignalsPage } from '@/components/signals/signals-page';
export const metadata: Metadata = {
  title: 'Signals — EquityWise',
  description: 'Confirmed VWAP Trend Pullback setups and your private paper journal.',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default function SignalsRoute() {
  return (
    <Suspense fallback={<p className="p-6">Loading signals…</p>}>
      <SignalsPage />
    </Suspense>
  );
}
