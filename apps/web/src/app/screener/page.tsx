import { isMetricKey } from '@equitywise/core';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { type ScreenerInitialState, ScreenerView } from '@/components/screener/screener-view';
import { MarketDataError } from '@/server/errors';
import {
  getSavedScreens,
  getScreenerMeta,
  runScreenForViewer,
  screenCountsForViewer,
} from '@/server/screener';
import { decodeFilterParam, sortSchema, universeSchema } from '@/server/screener-schemas';

export const metadata: Metadata = {
  title: 'Screener — EquityWise',
  description:
    'Multi-condition technical, delivery, F&O and ownership filters across every NSE stock.',
  // Signed-in only (plan §12): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/screener` — URL state: `p` preset, or `f` base64url filter; `u` universe;
 * `s` sort; `c` columns; `a` as-of session. Anything malformed falls back to
 * a default rather than an error page: a bad link opens a working screener.
 */
export default async function ScreenerRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  try {
    const [meta, saved] = await Promise.all([getScreenerMeta(), getSavedScreens()]);
    const preset = meta.presets.find((p) => p.id === one(params.p)) ?? null;
    const filterParam = decodeFilterParam(one(params.f));
    const fallback =
      filterParam === null && preset === null && one(params.f) === undefined
        ? (meta.presets[0] ?? null)
        : null;
    const activePreset = preset ?? fallback;
    const filter = activePreset?.filter ?? filterParam;

    const universe = universeSchema.safeParse(one(params.u)).data ?? 'all';
    const sort = sortSchema.safeParse(one(params.s)).data ?? activePreset?.sort ?? 'rsRank:desc';
    const allowed = new Set(meta.metrics.map((m) => m.key));
    const columns = (one(params.c) ?? '')
      .split(',')
      .filter((k) => isMetricKey(k) && allowed.has(k))
      .slice(0, 14);
    const asOf = meta.sessions.includes(one(params.a) ?? '') ? (one(params.a) ?? null) : null;

    const initial: ScreenerInitialState = {
      filter,
      presetId: activePreset?.id ?? null,
      universe,
      sort,
      columns: columns.length > 0 ? columns : meta.defaultColumns,
      asOf,
    };
    const base = { filter, universe, ...(asOf === null ? {} : { asOf }) };
    const [result, counts] = await Promise.all([
      runScreenForViewer({ ...base, sort, limit: 50, offset: 0 }).catch(() =>
        runScreenForViewer({
          filter: null,
          universe: 'all',
          sort: 'rsRank:desc',
          limit: 50,
          offset: 0,
        }),
      ),
      screenCountsForViewer(base).catch(() => ({
        base: 0,
        labels: [],
        individual: [],
        cumulative: [],
      })),
    ]);
    return (
      <ScreenerView
        meta={meta}
        initial={initial}
        initialResult={result}
        initialCounts={counts}
        initialSaved={saved}
      />
    );
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect('/login?next=%2Fscreener');
    throw error;
  }
}
