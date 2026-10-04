import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveImport } from '@/server/search';
import { handle, ok, parseBody } from '@/server/watchlist-routes';

/**
 * POST /api/search/resolve — many pasted/imported rows to instruments at once.
 *
 * The preview step of "paste or import a list": each row is answered as
 * matched, ambiguous (with the candidates) or unknown, and nothing is added
 * to any watchlist here. The browser parses the file and sends only the
 * symbol / ISIN / name per row — never the quantities or prices beside them.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rowSchema = z
  .object({
    symbol: z.string().trim().min(1).max(40).optional(),
    isin: z.string().trim().min(12).max(12).optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine(
    (row) => row.symbol !== undefined || row.isin !== undefined || row.name !== undefined,
    'A row needs a symbol, an ISIN or a name',
  );

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
});

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, bodySchema);
    if (!body.ok) return body.response;
    return ok({ results: await resolveImport(body.data.rows) });
  });
}
