import type { Metadata } from 'next';
import { BoardListRoute } from '@/components/ipos/list/board-list-route';

export const metadata: Metadata = {
  title: 'All IPOs',
  description:
    'Every mainboard and SME IPO in one table: dates, price band, minimum investment, size, demand and listing.',
  // Signed-in only (owner decision D3): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AllIposRoute({ searchParams }: { searchParams: SearchParams }) {
  return <BoardListRoute searchParams={searchParams} />;
}
