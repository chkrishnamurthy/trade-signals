import { randomBytes } from 'node:crypto';
import { buildAuthCodeUrl } from '@signal/fyers';
import { NextResponse } from 'next/server';

/**
 * GET /login — bounces to Fyers' authorisation page.
 *
 * Saves having to hand-build the OAuth URL: visit /login, sign in, and the
 * /callback route stores the token.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const appId = process.env.FYERS_APP_ID;
  const secretKey = process.env.FYERS_SECRET_KEY;
  const redirectUri = process.env.FYERS_REDIRECT_URI;

  if (!appId || !secretKey || !redirectUri) {
    return NextResponse.json(
      { error: 'FYERS_APP_ID, FYERS_SECRET_KEY and FYERS_REDIRECT_URI must be set in .env' },
      { status: 503 },
    );
  }

  const url = buildAuthCodeUrl({ appId, secretKey, redirectUri }, randomBytes(8).toString('hex'));
  return NextResponse.redirect(url, { status: 302 });
}
