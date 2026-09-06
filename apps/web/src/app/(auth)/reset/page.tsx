import { ResetForm } from '@/components/auth/reset-form';

export const dynamic = 'force-dynamic';

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' && raw !== '' ? raw : null;
  return <ResetForm token={token} />;
}
