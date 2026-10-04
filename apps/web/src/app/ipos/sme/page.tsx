import { redirectToTable } from '@/components/ipos/list/board-list-route';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The old board list's address: the master table, scoped to SME. */
export default async function SmeIposRoute({ searchParams }: { searchParams: SearchParams }) {
  return redirectToTable('sme', await searchParams);
}
