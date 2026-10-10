import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/require-user';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BreadthRoute({ searchParams }: { searchParams: SearchParams }) {
  const u = (await searchParams).u;
  const target = u === 'nifty500' ? '/today?u=nifty500' : '/today';
  if ((await getSessionUser()) === null) {
    redirect(`/login?next=${encodeURIComponent(target)}`);
  }
  redirect(target);
}
