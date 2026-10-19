import 'server-only';
import type { AuthUser } from '@equitywise/db';
import { redirect } from 'next/navigation';
import { getAdminUser } from './require-user';

/** Shared guard for admin-only server component pages. */
export async function requireAdminPage(redirectTo = '/watchlists'): Promise<AuthUser> {
  const admin = await getAdminUser();
  if (admin === null) redirect(redirectTo);
  return admin;
}
