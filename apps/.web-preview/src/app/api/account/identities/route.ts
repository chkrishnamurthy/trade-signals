import { listAccountMethods } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });
  return json(await listAccountMethods(getDatabase(), user.id));
}
