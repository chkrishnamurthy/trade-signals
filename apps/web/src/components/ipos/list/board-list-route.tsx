import type { IpoBoard } from '@equitywise/shared';
import { permanentRedirect, redirect } from 'next/navigation';
import { tableHref } from '@/lib/ipo-routes';
import { MarketDataError } from '@/server/errors';
import { ipoBoardListQuerySchema, searchParamsObject } from '@/server/ipo-schemas';
import { getIpoListPage } from '@/server/ipos';
import { IpoListView } from './ipo-list-view';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The body of `/ipos/all`, the master table. An invalid filter in a
 * hand-edited URL falls back to the unfiltered list rather than erroring; the
 * API is where a 400 belongs.
 */
export async function BoardListRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = searchParamsObject(await searchParams);
  const parsed = ipoBoardListQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : { board: 'all' as const, page: 1 };
  try {
    const data = await getIpoListPage(query.board, query);
    return <IpoListView data={data} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401) {
      const qs = new URLSearchParams(params).toString();
      redirect(`/login?next=${encodeURIComponent(`/ipos/all${qs === '' ? '' : `?${qs}`}`)}`);
    }
    throw error;
  }
}

/**
 * `/ipos/mainboard` and `/ipos/sme` were the board lists before the section
 * had one table; their links (and bookmarks) land on it, filters kept.
 */
export function redirectToTable(
  board: IpoBoard,
  searchParams: Record<string, string | string[] | undefined>,
): never {
  const kept = Object.entries(searchParamsObject(searchParams)).filter(([k]) => k !== 'board');
  permanentRedirect(tableHref(board, Object.fromEntries(kept)));
}
