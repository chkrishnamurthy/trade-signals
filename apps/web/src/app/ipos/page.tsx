import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { IpoDashboardView } from '@/components/ipos/dashboard/ipo-dashboard-view';
import { MarketDataError } from '@/server/errors';
import { ipoDashboardQuerySchema, searchParamsObject } from '@/server/ipo-schemas';
import { getIpoDashboard } from '@/server/ipos';

export const metadata: Metadata = {
  title: 'IPO dashboard — EquityWise',
  description:
    'Indian mainboard and SME IPOs today: open issues, subscription, listing performance, allotment and offer documents.',
  // Signed-in only (owner decision D3): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** List filters that used to live on `/ipos`; such links now open the board's full list. */
const LIST_PARAMS = ['status', 'q', 'page', 'exchange', 'year'] as const;

export default async function IposRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = searchParamsObject(await searchParams);
  const parsed = ipoDashboardQuerySchema.safeParse(params);
  const board = parsed.success ? parsed.data.board : 'mainboard';
  if (LIST_PARAMS.some((k) => k in params)) {
    const kept = new URLSearchParams();
    for (const k of LIST_PARAMS)
      if (k !== 'exchange' && params[k] !== undefined) kept.set(k, params[k]);
    const qs = kept.toString();
    redirect(`/ipos/${board}${qs === '' ? '' : `?${qs}`}` as Route);
  }
  try {
    return <IpoDashboardView data={await getIpoDashboard(board)} />;
  } catch (error) {
    // A present-but-stale session cookie gets past the edge gate (middleware
    // only checks that one exists); send it to sign in rather than an error.
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent(board === 'sme' ? '/ipos?board=sme' : '/ipos')}`);
    throw error;
  }
}
