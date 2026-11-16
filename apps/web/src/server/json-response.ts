import 'server-only';
import { NextResponse } from 'next/server';

/**
 * The two JSON responses every API route sends.
 *
 * One definition, so an error has one shape — `{ error, code?, remedy? }`, the
 * `MarketErrorDto` the clients already render — wherever it comes from. Always
 * `no-store`: an API answer is about one user at one moment.
 *
 * Routes import these through `@/server/api-response` (which adds body parsing
 * and failure mapping) or `@/server/auth/http` (which adds the session cookie
 * handling); this file exists so those two can share them without importing
 * each other.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function jsonError(
  message: string,
  status: number,
  extra: { code?: string; remedy?: string } = {},
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status, headers: NO_STORE });
}

export function ok<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: NO_STORE });
}
