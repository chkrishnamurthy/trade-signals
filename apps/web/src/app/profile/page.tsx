import { getUserWithProfile, listWatchlists } from '@equitywise/db';
import { redirect } from 'next/navigation';
import { ProfileTabs } from '@/components/profile/profile-tabs';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your profile — EquityWise' };

/** Everything the profile UI needs, already scrubbed of secrets. */
export interface ProfilePageData {
  readonly id: number;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly role: 'user' | 'admin';
  readonly memberSince: string;
  readonly profile: {
    readonly displayName: string;
    readonly avatarUrl: string | null;
    readonly bio: string | null;
    readonly timezone: string;
    readonly locale: string;
    readonly defaultWatchlistId: number | null;
  };
  readonly watchlists: readonly { readonly id: number; readonly name: string }[];
}

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (user === null) redirect('/login?next=/profile');

  const db = getDatabase();
  const full = await getUserWithProfile(db, user.id);
  if (full === null) redirect('/login');

  const watchlists = await listWatchlists(db, user.id);
  const prefs = full.profile.preferences as { defaultWatchlistId?: number | null };

  const data: ProfilePageData = {
    id: full.id,
    email: full.email,
    emailVerified: full.emailVerifiedAt !== null,
    role: full.role,
    memberSince: full.createdAt.toISOString(),
    profile: {
      displayName: full.profile.displayName,
      avatarUrl: full.profile.avatarUrl,
      bio: full.profile.bio,
      timezone: full.profile.timezone,
      locale: full.profile.locale,
      defaultWatchlistId:
        typeof prefs.defaultWatchlistId === 'number' ? prefs.defaultWatchlistId : null,
    },
    watchlists: watchlists.map((w) => ({ id: w.id, name: w.name })),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="font-semibold text-foreground text-xl tracking-tight">Your profile</h1>
        <a href="/watchlists" className="text-muted-foreground text-sm hover:text-foreground">
          ← Back to app
        </a>
      </div>
      <ProfileTabs data={data} />
    </main>
  );
}
