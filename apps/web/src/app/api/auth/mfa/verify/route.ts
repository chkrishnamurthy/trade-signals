import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { MfaError, verifyMfaChallenge } from '@/server/auth/mfa';
import { isSameOrigin } from '@/server/auth/request';
import { mfaVerifySchema } from '@/server/auth/schemas';
import { sessionBody } from '@/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  const parsed = mfaVerifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return fail('Enter a valid verification code.', 400, { code: 'INVALID_BODY' });
  try {
    const { redirectTo, issued } = await verifyMfaChallenge({
      request,
      challengeId: parsed.data.challengeId,
      ...(parsed.data.code ? { code: parsed.data.code } : {}),
      ...(parsed.data.recoveryCode ? { recoveryCode: parsed.data.recoveryCode } : {}),
      ...(parsed.data.binding ? { binding: parsed.data.binding } : {}),
      deviceName: parsed.data.device?.name ?? null,
    });
    return json({ redirectTo, ...sessionBody(issued) });
  } catch (error) {
    if (error instanceof MfaError) return fail(error.message, error.status, { code: error.code });
    return fail('Two-factor verification is temporarily unavailable.', 503, {
      code: 'TEMPORARY_FAILURE',
    });
  }
}
