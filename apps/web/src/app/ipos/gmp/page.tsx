import type { Metadata } from 'next';
import { IpoGmpView } from '@/components/ipos/gmp/ipo-gmp-view';
import { readOrSignIn } from '@/components/ipos/section-route';
import { ipoDashboardQuerySchema, searchParamsObject } from '@/server/ipo-schemas';
import { getIpoGmpPage } from '@/server/ipos';

export const metadata: Metadata = {
  title: 'Grey market — EquityWise',
  description:
    'The unofficial grey-market premium of unlisted Indian IPOs and how it compared with listings.',
  // Signed-in only (owner decision D3): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function IpoGmpRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = searchParamsObject(await searchParams);
  const parsed = ipoDashboardQuerySchema.safeParse(params);
  const scope = parsed.success ? parsed.data.board : 'all';
  const data = await readOrSignIn(`/ipos/gmp${scope === 'all' ? '' : `?board=${scope}`}`, () =>
    getIpoGmpPage(scope),
  );
  return <IpoGmpView data={data} />;
}
