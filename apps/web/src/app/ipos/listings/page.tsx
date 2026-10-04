import type { Metadata } from 'next';
import { IpoListingsView } from '@/components/ipos/listings/ipo-listings-view';
import { readOrSignIn } from '@/components/ipos/section-route';
import { ipoListingsQuerySchema, searchParamsObject } from '@/server/ipo-schemas';
import { getIpoListingsPage } from '@/server/ipos';

export const metadata: Metadata = {
  title: 'IPO listings — EquityWise',
  description: 'How Indian IPOs listed against their issue price, month by month.',
  // Signed-in only (owner decision D3): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function IpoListingsRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = searchParamsObject(await searchParams);
  const parsed = ipoListingsQuerySchema.safeParse(params);
  const q = parsed.success ? parsed.data : { board: 'all' as const, page: 1 };
  const qs = new URLSearchParams(params).toString();
  const data = await readOrSignIn(`/ipos/listings${qs === '' ? '' : `?${qs}`}`, () =>
    getIpoListingsPage(q.board, q),
  );
  return <IpoListingsView data={data} />;
}
