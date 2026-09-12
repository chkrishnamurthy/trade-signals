import type { Metadata } from 'next';
import { AnnouncementsView } from '@/components/disclosures/announcements-view';
import { getAnnouncementsPage } from '@/server/disclosures';

export const metadata: Metadata = {
  title: 'Announcements — EquityWise',
  description: 'Official corporate filings published by the NSE and BSE.',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function AnnouncementsRoute({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const categories = toArray(sp.category);
  const pageValue = Number(sp.page ?? '1');

  const data = await getAnnouncementsPage({
    watchlistOnly: sp.watchlist === '1',
    categories,
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  });

  return <AnnouncementsView data={data} activeCategories={categories} />;
}
