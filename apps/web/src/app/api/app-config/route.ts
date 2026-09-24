import { NextResponse } from 'next/server';
import { loadAppConfig } from '@/server/app-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/app-config — public runtime config for the mobile app (version gate, auth switches). */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadAppConfig(), {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (error) {
    console.error('[app-config] failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: 'App configuration is temporarily unavailable.', code: 'TEMPORARY_FAILURE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
