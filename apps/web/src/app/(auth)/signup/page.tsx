import { notFound, redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth/signup-form';
import { signupEnabled } from '@/server/auth/env';
import { getSessionUser } from '@/server/auth/require-user';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (!signupEnabled()) notFound();
  if ((await getSessionUser()) !== null) redirect('/watchlists');
  return <SignupForm />;
}
