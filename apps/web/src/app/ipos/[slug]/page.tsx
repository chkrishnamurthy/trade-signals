import { istDateKey } from '@equitywise/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { IpoDetailView } from '@/components/ipos/detail/ipo-detail-view';
import { MarketDataError } from '@/server/errors';
import { ipoSlugSchema } from '@/server/ipo-schemas';
import { getIpoDetail } from '@/server/ipos';

export const metadata: Metadata = {
  title: 'IPO',
  // Signed-in only (owner decision D3): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function IpoDetailRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = ipoSlugSchema.safeParse(slug);
  if (!parsed.success) notFound();
  try {
    const now = new Date();
    const ipo = await getIpoDetail(parsed.data, now);
    return <IpoDetailView ipo={ipo} today={istDateKey(now)} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 404) notFound();
    // A present-but-stale session cookie gets past the edge gate; send it to sign in.
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent(`/ipos/${parsed.data}`)}`);
    throw error;
  }
}
