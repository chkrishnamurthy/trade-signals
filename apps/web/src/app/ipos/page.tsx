import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { IpoDashboardView } from '@/components/ipos/dashboard/ipo-dashboard-view';
import { overviewHref, tableHref } from '@/lib/ipo-routes';
import { MarketDataError } from '@/server/errors';
import { ipoDashboardQuerySchema, searchParamsObject } from '@/server/ipo-schemas';
import { getIpoDashboard } from '@/server/ipos';

export const metadata: Metadata = {
  title: 'IPOs',
  description:
    'Indian mainboard and SME IPOs: open issues, what opens next, allotment, listing performance and offer documents.',
  // Signed-in only (owner decision D3): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** List filters that used to live on `/ipos`; such links now open the master table. */
const LIST_PARAMS = ['status', 'q', 'page', 'year'] as const;

export default async function IposRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = searchParamsObject(await searchParams);
  const parsed = ipoDashboardQuerySchema.safeParse(params);
  const scope = parsed.success ? parsed.data.board : 'all';
  if (LIST_PARAMS.some((k) => k in params)) {
    redirect(tableHref(scope, Object.fromEntries(LIST_PARAMS.map((k) => [k, params[k]]))));
  }
  try {
    return <IpoDashboardView data={await getIpoDashboard(scope)} />;
  } catch (error) {
    // A present-but-stale session cookie gets past the edge gate (middleware
    // only checks that one exists); send it to sign in rather than an error.
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent(overviewHref(scope))}`);
    throw error;
  }
}
