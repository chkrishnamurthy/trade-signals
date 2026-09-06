import { VerifyClient } from '@/components/auth/verify-client';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' && raw !== '' ? raw : null;
  return <VerifyClient token={token} />;
}
