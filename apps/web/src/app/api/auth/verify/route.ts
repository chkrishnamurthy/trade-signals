import { consumeToken, markEmailVerified, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { tokenSchema } from '@/server/auth/schemas';
import { hashToken } from '@/server/auth/session-token';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/verify — consume an email-verification token. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('Request body is not valid JSON.', 400, { code: 'INVALID_BODY' });
  }
  const parsed = tokenSchema.safeParse(raw);
  if (!parsed.success) return fail('Invalid link.', 400, { code: 'INVALID_TOKEN' });

  const db = getDatabase();
  const userId = await consumeToken(db, hashToken(parsed.data.token), 'email_verify');
  if (userId === null) {
    return fail('This verification link is invalid or has expired.', 400, { code: 'INVALID_TOKEN' });
  }

  await markEmailVerified(db, userId);
  await writeAudit(db, { event: 'email_verified', userId, ipAddress: clientIp(request) });
  return json({ ok: true });
}
