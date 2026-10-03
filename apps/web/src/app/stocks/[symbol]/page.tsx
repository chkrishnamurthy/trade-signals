import type { Metadata, Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { StockView } from '@/components/stocks/stock-view';
import { MarketDataError } from '@/server/errors';
import { getStockResearchPage } from '@/server/stock-research';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ symbol: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  return {
    title: `${symbol} — EquityWise`,
    // Signed-in only until data-display rights are settled (plan §12): never indexed.
    robots: { index: false, follow: false },
  };
}

/**
 * `/stocks/[symbol]` — one stock from stored end-of-day data. The canonical
 * URL is lowercase; any other casing redirects. `?screen=` (base64url filter)
 * and `?sn=` (its name) come from a screener row and drive the
 * "Matched because" banner.
 */
export default async function StockRoute({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const raw = decodeURIComponent((await params).symbol);
  const query = await searchParams;
  const screen = one(query.screen);
  const screenName = one(query.sn);
  if (raw !== raw.toLowerCase()) {
    const qs = new URLSearchParams();
    if (screen !== undefined) qs.set('screen', screen);
    if (screenName !== undefined) qs.set('sn', screenName);
    redirect(
      `/stocks/${encodeURIComponent(raw.toLowerCase())}${qs.size === 0 ? '' : `?${qs}`}` as Route,
    );
  }
  try {
    const data = await getStockResearchPage(raw, { screen, screenName });
    if (data === null) notFound();
    const backHref = screen === undefined ? null : `/screener?f=${encodeURIComponent(screen)}`;
    return <StockView data={data} backHref={backHref} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent(`/stocks/${raw}`)}` as Route);
    throw error;
  }
}
