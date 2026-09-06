import { writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { clientIp, isSameOrigin, userAgent } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { endAllSessions, endCurrentSession } from '@/server/auth/session';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/sign-out — delete the session server-side (add ?all=true for every device). */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  }
  const user = await getSessionUser();
  const all = new URL(request.url).searchParams.get('all') === 'true';

  if (user !== null && all) {
    await endAllSessions(user.id);
  } else {
    await endCurrentSession();
  }

  if (user !== null) {
    await writeAudit(getDatabase(), {
      event: 'logout',
      userId: user.id,
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });
  }
  return json({ ok: true });
}
