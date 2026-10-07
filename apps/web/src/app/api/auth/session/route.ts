import type { NextResponse } from 'next/server';
import { json } from '@/server/auth/http';
import { getSessionPayload } from '@/server/auth/session-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth/session — the current user (identity + profile), or null. No secrets. */
export async function GET(): Promise<NextResponse> {
  return json({ user: await getSessionPayload() });
}
