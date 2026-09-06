import 'server-only';
import { NextResponse } from 'next/server';

/**
 * JSON responses in the shape the client already renders (`{ error, code,
 * remedy? }`), always `no-store` — auth responses must never be cached.
 */

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function fail(
  message: string,
  status: number,
  extra: { code?: string; remedy?: string } = {},
): NextResponse {
  return NextResponse.json(
    { error: message, ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export const unauthenticated = (): NextResponse =>
  fail('Not signed in.', 401, { code: 'UNAUTHENTICATED', remedy: 'Sign in and try again.' });
