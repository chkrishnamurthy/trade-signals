import 'server-only';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { MarketDataError, toMarketError } from './errors';

/**
 * Shared plumbing for the watchlist route handlers.
 *
 * Every handler needs the same three things — a validated body, a parsed id,
 * and one consistent error shape — and writing them out eight times is how the
 * eighth endpoint ends up answering 500 where the others answer 400.
 *
 * The error shape matches `MarketErrorDto`, which the client already knows how
 * to render, so a watchlist failure surfaces through the same path as a quote
 * failure rather than needing its own branch in the UI.
 */

export function jsonError(
  message: string,
  status: number,
  extra: { code?: string; remedy?: string } = {},
): NextResponse {
  return NextResponse.json(
    { error: message, ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function ok<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Route params are strings; a non-numeric id is a 400, never a database call. */
export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError('Request body is not valid JSON.', 400) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    // The first issue only: these are single-user forms, and a wall of paths
    // helps nobody. The message is the one the field can show inline.
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    return {
      ok: false,
      response: jsonError(issue?.message ?? 'Invalid request.', 400, {
        code: path === '' ? 'INVALID_BODY' : `INVALID_${path.toUpperCase()}`,
      }),
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Runs a handler, mapping any failure onto the shared error shape.
 *
 * A duplicate name is the one domain error worth naming specially: it is a
 * unique-index violation the user caused and can fix, not a fault.
 */
export async function handle(run: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      return jsonError('A watchlist with that name already exists.', 409, {
        code: 'DUPLICATE_NAME',
        remedy: 'Pick a different name.',
      });
    }
    const failure = error instanceof MarketDataError ? error : toMarketError(error);
    return jsonError(failure.message, failure.status, {
      code: failure.code,
      ...(failure.remedy === undefined ? {} : { remedy: failure.remedy }),
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
