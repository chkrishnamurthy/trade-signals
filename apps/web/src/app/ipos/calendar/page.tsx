import type { Metadata } from 'next';
import { IpoCalendarView } from '@/components/ipos/calendar/ipo-calendar-view';
import { readOrSignIn } from '@/components/ipos/section-route';
import { ipoCalendarPageQuerySchema, searchParamsObject } from '@/server/ipo-schemas';
import { getIpoCalendarPage } from '@/server/ipos';

export const metadata: Metadata = {
  title: 'IPO calendar — EquityWise',
  description: 'Bidding windows, allotment and listing days of Indian IPOs on one timeline.',
  // Signed-in only (owner decision D3): never indexed.
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function IpoCalendarRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = searchParamsObject(await searchParams);
  const parsed = ipoCalendarPageQuerySchema.safeParse(params);
  const q = parsed.success ? parsed.data : { board: 'all' as const, from: undefined };
  const qs = new URLSearchParams(params).toString();
  const data = await readOrSignIn(`/ipos/calendar${qs === '' ? '' : `?${qs}`}`, () =>
    getIpoCalendarPage(q.board, q.from),
  );
  return <IpoCalendarView data={data} />;
}
