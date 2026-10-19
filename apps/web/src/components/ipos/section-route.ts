import { redirect } from 'next/navigation';
import { MarketDataError } from '@/server/errors';

/**
 * Runs a section page's read; a present-but-stale session cookie gets past the
 * edge gate (middleware only checks that one exists), so a 401 goes to sign
 * in, back to the same address, rather than to an error page.
 */
export async function readOrSignIn<T>(path: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent(path)}`);
    throw error;
  }
}
