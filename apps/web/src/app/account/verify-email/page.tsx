import { redirect } from 'next/navigation';
import { VerifyEmailClient } from '@/components/profile/verify-email-client';
import { getSessionUser } from '@/server/auth/require-user';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Confirm email change — EquityWise' };

/**
 * Landing page for the email-change confirmation link. Requires a signed-in
 * session (the confirm route checks the token's user matches); an unauthenticated
 * visitor is sent to sign in first and returned here.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await getSessionUser();
  const { token } = await searchParams;
  if (user === null) {
    const next = `/account/verify-email${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <VerifyEmailClient token={token ?? null} />
    </main>
  );
}
