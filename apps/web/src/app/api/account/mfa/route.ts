import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { beginMfaEnrollment, confirmMfaEnrollment, MfaError, turnOffMfa } from '@/server/auth/mfa';
import { isSameOrigin } from '@/server/auth/request';
import { getSessionAuthContext } from '@/server/auth/require-user';
import { mfaCodeSchema } from '@/server/auth/schemas';
import { sessionBody } from '@/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  const context = await getSessionAuthContext();
  if (!context) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });
  if (
    context.session.reauthenticatedAt === null ||
    Date.now() - context.session.reauthenticatedAt.getTime() > 5 * 60_000
  )
    return fail('Sign in again before changing two-factor authentication.', 403, {
      code: 'REAUTH_REQUIRED',
    });
  try {
    return json(await beginMfaEnrollment(context.user.id));
  } catch (error) {
    return mapError(error);
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  const context = await getSessionAuthContext();
  if (!context) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });
  const parsed = mfaCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Enter the six-digit code.', 400, { code: 'INVALID_BODY' });
  try {
    const issued = await confirmMfaEnrollment(context.user.id, parsed.data.code, request);
    return json({ ok: true, ...sessionBody(issued) });
  } catch (error) {
    return mapError(error);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  const context = await getSessionAuthContext();
  if (!context) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });
  const parsed = mfaCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Enter the six-digit code.', 400, { code: 'INVALID_BODY' });
  try {
    const issued = await turnOffMfa(context.user.id, parsed.data.code, request);
    return json({ ok: true, ...sessionBody(issued) });
  } catch (error) {
    return mapError(error);
  }
}

function mapError(error: unknown): NextResponse {
  if (error instanceof MfaError) return fail(error.message, error.status, { code: error.code });
  console.error('[account/mfa] failed:', error instanceof Error ? error.message : 'unknown');
  return fail('Two-factor authentication is temporarily unavailable.', 503, {
    code: 'TEMPORARY_FAILURE',
  });
}
