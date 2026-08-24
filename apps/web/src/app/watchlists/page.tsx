import type { Metadata } from 'next';
import { WatchlistsPage } from '@/components/watchlists/watchlists-page';

export const metadata: Metadata = {
  title: 'Watchlists — WealthOS',
  description:
    'Track sets of NSE names with live quotes and daily indicators, with the columns, filters and sort you choose. Decision support, not advice.',
};

/** Reads live quotes on every request; never prerender. */
export const dynamic = 'force-dynamic';

export default function WatchlistsRoute() {
  return <WatchlistsPage />;
}
