import type { Metadata } from 'next';
import { FlowView } from '@/components/disclosures/flow-view';
import { getInstitutionalFlow } from '@/server/disclosures';

export const metadata: Metadata = {
  title: 'Institutional Flow — EquityWise',
  description:
    'FII/DII flows, futures positioning, delivery and bulk & block deals from the exchanges.',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FlowsRoute({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = await getInstitutionalFlow({ watchlistOnly: sp.watchlist === '1' });
  return <FlowView data={data} />;
}
