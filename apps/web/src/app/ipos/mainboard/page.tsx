import { redirectToTable } from '@/components/ipos/list/board-list-route';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The old board list's address: the master table, scoped to the mainboard. */
export default async function MainboardIposRoute({ searchParams }: { searchParams: SearchParams }) {
  return redirectToTable('mainboard', await searchParams);
}
