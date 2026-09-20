import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { googleAuthEnabled } from '@/server/auth/env';
import { safeRedirectPath } from '@/server/auth/redirects';
import { getSessionUser } from '@/server/auth/require-user';

export const dynamic = 'force-dynamic';

/** Only same-origin, path-only redirect targets are honoured (no open redirect). */
function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  return safeRedirectPath(next);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if ((await getSessionUser()) !== null) redirect(next);

  const errorParam = typeof params.error === 'string' ? params.error : undefined;

  return (
    <LoginForm
      next={next}
      accountCreated={params.created === '1'}
      googleEnabled={googleAuthEnabled()}
      initialError={errorParam}
    />
  );
}
