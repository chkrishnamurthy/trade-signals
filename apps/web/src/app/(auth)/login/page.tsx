import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getSessionUser } from '@/server/auth/require-user';

export const dynamic = 'force-dynamic';

/** Only same-origin, path-only redirect targets are honoured (no open redirect). */
function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/watchlists';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  if ((await getSessionUser()) !== null) redirect(next);
  return <LoginForm next={next} />;
}
