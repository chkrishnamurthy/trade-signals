import { redirect } from 'next/navigation';

/**
 * Entry point.
 *
 * Watchlists is the product surface; nothing else sits in front of it.
 */
export default function HomePage() {
  redirect('/watchlists');
}
