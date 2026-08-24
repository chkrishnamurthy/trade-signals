import type { Metadata } from 'next';
import { WatchlistsPage } from '@/components/watchlists/watchlists-page';

export const metadata: Metadata = {
  title: 'My watchlists — WealthOS',
  description:
    'Group the stocks you follow and track their prices and technical readings side by side.',
};

/** Reads live quotes on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default function WatchlistsRoute() {
  return <WatchlistsPage />;
}
