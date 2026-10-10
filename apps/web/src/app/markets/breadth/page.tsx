import { redirect } from 'next/navigation';
import { marketBriefHref, parseMarketBriefUniverse } from '@/lib/market-brief';
import { getSessionUser } from '@/server/auth/require-user';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BreadthRoute({ searchParams }: { searchParams: SearchParams }) {
  const u = (await searchParams).u;
  const target = marketBriefHref(parseMarketBriefUniverse(u));
  if ((await getSessionUser()) === null) {
    redirect(`/login?next=${encodeURIComponent(target)}`);
  }
  redirect(target);
}
