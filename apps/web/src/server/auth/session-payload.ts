import 'server-only';
import { getUserWithProfile, mfaEnabled } from '@equitywise/db';
import { getDatabase } from '@/server/db';
import { getSessionUser } from './require-user';

/**
 * The signed-in user as the browser may see it — identity and profile, no
 * secrets. One shape for `GET /api/auth/session` and for the root layout,
 * which sends it with the page so the navigation knows the user (and an
 * admin's Admin menu) on the first paint instead of after a round trip.
 */
export async function getSessionPayload() {
  const user = await getSessionUser();
  if (user === null) return null;

  const db = getDatabase();
  const [full, mfa] = await Promise.all([getUserWithProfile(db, user.id), mfaEnabled(db, user.id)]);
  if (full === null) return null;

  return {
    id: full.id,
    email: full.email,
    role: full.role,
    emailVerified: full.emailVerifiedAt !== null,
    mfaEnabled: mfa,
    profile: full.profile,
  };
}

/**
 * What the root layout sends with every page: only what the navigation draws
 * (name, avatar, role). The full profile stays behind `/api/auth/session`.
 */
export async function getNavigationSession(): Promise<{
  readonly email: string;
  readonly role: 'user' | 'admin';
  readonly profile: { readonly displayName: string; readonly avatarUrl: string | null };
} | null> {
  const payload = await getSessionPayload();
  if (payload === null) return null;
  return {
    email: payload.email,
    role: payload.role,
    profile: { displayName: payload.profile.displayName, avatarUrl: payload.profile.avatarUrl },
  };
}
