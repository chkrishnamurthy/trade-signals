import 'server-only';
import type { NextResponse } from 'next/server';
import type { z } from 'zod';
import { searchParamsObject } from './ipo-schemas';
import { jsonError } from './watchlist-routes';

/**
 * Query-string validation for the IPO routes: the first invalid field is a 400
 * naming it (`INVALID_STATUS`), in the shared error shape.
 */
export function parseQuery<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): { ok: true; data: z.output<S> } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(searchParamsObject(new URL(request.url).searchParams));
  if (result.success) return { ok: true, data: result.data as z.output<S> };
  const issue = result.error.issues[0];
  const path = issue?.path.join('.') ?? '';
  return {
    ok: false,
    response: jsonError(issue?.message ?? 'Invalid request.', 400, {
      code: path === '' ? 'INVALID_QUERY' : `INVALID_${path.toUpperCase()}`,
    }),
  };
}
