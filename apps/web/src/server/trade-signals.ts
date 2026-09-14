import 'server-only';
import {
  createPaperStudy,
  getSignalSummary,
  getVwapSignal,
  listVwapSignals,
  SignalConflict,
} from '@equitywise/db';
import { paperRequestSchema, signalQuerySchema } from '@equitywise/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { unauthenticated } from './auth/http';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';

async function authenticated(run: (userId: number) => Promise<unknown>): Promise<NextResponse> {
  try {
    const user = await getSessionUser();
    if (!user) return unauthenticated();
    return NextResponse.json(await run(user.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status =
      error instanceof SignalConflict ? error.status : error instanceof z.ZodError ? 400 : 503;
    // Never expose database errors, query text or connection details to clients.
    return NextResponse.json(
      {
        error:
          error instanceof SignalConflict
            ? error.message
            : error instanceof z.ZodError
              ? (error.issues[0]?.message ?? 'Invalid request.')
              : 'Signal data is temporarily unavailable.',
        code:
          status === 400
            ? 'INVALID_INPUT'
            : status === 409
              ? 'SIGNAL_CONFLICT'
              : 'SIGNALS_UNAVAILABLE',
      },
      {
        status,
        headers: {
          'Cache-Control': 'no-store',
          ...(status === 503 ? { 'Retry-After': '30' } : {}),
        },
      },
    );
  }
}
export function readSignals(request: Request) {
  return authenticated((userId) =>
    listVwapSignals(
      getDatabase(),
      userId,
      signalQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      Date.now(),
    ),
  );
}
export function readSignal(id: string) {
  return authenticated(() =>
    getVwapSignal(getDatabase(), z.coerce.number().int().positive().safe().parse(id), Date.now()),
  );
}
export function readSignalSummary() {
  return authenticated((userId) => getSignalSummary(getDatabase(), userId, Date.now()));
}
export function enrolPaperStudy(request: Request) {
  return authenticated(async (userId) => {
    const origin = request.headers.get('origin');
    if (
      !origin ||
      origin !== new URL(request.url).origin ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      throw new SignalConflict('Same-origin request required.', 403);
    if ((request.headers.get('content-type') ?? '').split(';')[0] !== 'application/json')
      throw new SignalConflict('JSON content required.', 400);
    const text = await request.text();
    if (text.length > 4096) throw new SignalConflict('Request too large.', 413);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new SignalConflict('Invalid JSON.', 400);
    }
    const result = await createPaperStudy(
      getDatabase(),
      userId,
      paperRequestSchema.parse(raw),
      Date.now(),
      Date.now,
    );
    return z.object({ id: z.number().int().positive() }).parse(result);
  });
}
