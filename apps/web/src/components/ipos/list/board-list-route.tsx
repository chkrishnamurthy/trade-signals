import type { IpoBoard } from '@equitywise/shared';
import { redirect } from 'next/navigation';
import { MarketDataError } from '@/server/errors';
import { ipoBoardListQuerySchema, searchParamsObject } from '@/server/ipo-schemas';
import { getIpoListPage } from '@/server/ipos';
import { IpoListView } from './ipo-list-view';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The body of `/ipos/mainboard` and `/ipos/sme`. An invalid filter in a
 * hand-edited URL falls back to the unfiltered list rather than erroring; the
 * API is where a 400 belongs.
 */
export async function BoardListRoute({
  board,
  searchParams,
}: {
  board: IpoBoard;
  searchParams: SearchParams;
}) {
  const params = searchParamsObject(await searchParams);
  const parsed = ipoBoardListQuerySchema.safeParse(params);
  try {
    const data = await getIpoListPage(board, parsed.success ? parsed.data : { page: 1 });
    return <IpoListView data={data} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401) {
      const qs = new URLSearchParams(params).toString();
      redirect(`/login?next=${encodeURIComponent(`/ipos/${board}${qs === '' ? '' : `?${qs}`}`)}`);
    }
    throw error;
  }
}
