import 'server-only';
import { isUniqueViolation, violatedConstraint } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import type { ZodType, ZodTypeDef } from 'zod';
import { clearStaleSessionCookie } from './auth/http';
import { isUserAuthenticationError, MarketDataError, toMarketError } from './errors';
import { jsonError, ok } from './json-response';

/**
 * Shared plumbing for API route handlers — every feature's, not one's.
 *
 * Every handler needs the same three things — a validated body, a parsed id,
 * and one consistent error shape — and writing them out per route is how one
 * endpoint ends up answering 500 where the others answer 400.
 *
 * The error shape matches `MarketErrorDto`, which the client already knows how
 * to render, so any failure surfaces through the same path as a quote failure
 * rather than needing its own branch in the UI.
 */

export { jsonError, ok };

/** Route params are strings; a non-numeric id is a 400, never a database call. */
export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseBody<T>(
  request: Request,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError('Request body is not valid JSON.', 400) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    // The first issue only: a form shows one message at a time, and a wall of
    // paths helps nobody. The message is the one the field can show inline.
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

/** Zod-validates a route's query string while preserving the shared error shape. */
export function parseQuery<T>(
  searchParams: URLSearchParams,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Parsed<T> {
  const result = schema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      response: jsonError(issue?.message ?? 'Invalid query.', 400, {
        code: 'INVALID_QUERY',
        remedy: 'Use valid market calendar filters and try again.',
      }),
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Runs a handler, mapping any failure onto the shared error shape.
 *
 * A duplicate is the one database error worth naming specially: it is a
 * unique-index violation the user caused and can fix, not a fault. The message
 * comes from the index that refused the write (see `duplicateResponse`).
 */
export async function handle(run: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateResponse(violatedConstraint(error));
    const failure = error instanceof MarketDataError ? error : toMarketError(error);
    const response = jsonError(failure.message, failure.status, {
      code: failure.code,
      ...(failure.remedy === undefined ? {} : { remedy: failure.remedy }),
    });
    // Only an EquityWise session failure invalidates the browser cookie. An
    // upstream provider credential failure also uses 401, but the user's
    // session remains valid (see isUserAuthenticationError).
    return isUserAuthenticationError(failure) ? clearStaleSessionCookie(response) : response;
  }
}

/** The unique indexes a user can trip by choosing a name that is taken. */
const DUPLICATE_NAME_MESSAGES: Readonly<Record<string, string>> = {
  watchlists_owner_name_idx: 'A watchlist with that name already exists.',
  saved_screens_owner_name_idx: 'You already have a screen with that name.',
  watchlist_views_owner_scope_name_idx: 'You already have a view with that name.',
};

/**
 * The 409 for a unique-index violation.
 *
 * Every route shares `handle`, so the wording must come from the index that was
 * violated — not from the first feature that used this helper. An index with no
 * entry above gets a neutral message rather than another feature's.
 */
export function duplicateResponse(constraint: string | null): NextResponse {
  const named = constraint === null ? undefined : DUPLICATE_NAME_MESSAGES[constraint];
  if (named !== undefined) {
    return jsonError(named, 409, { code: 'DUPLICATE_NAME', remedy: 'Pick a different name.' });
  }
  return jsonError('That already exists.', 409, {
    code: 'DUPLICATE',
    remedy: 'Refresh the page and try again.',
  });
}
