import type { NextResponse } from 'next/server';
import { limitByIp } from '@/server/auth/request-limit';
import {
  commitPortfolioImport,
  importBodySchema,
  previewPortfolioImport,
} from '@/server/portfolio';
import { handle, jsonError, ok, parseBody } from '@/server/watchlist-routes';

/**
 * POST /api/portfolio/import
 *   { text }                       → preview: every row with its status, nothing saved
 *   { text, commit: true, includeChecked? } → save the rows that were Ready (and, if
 *                                    asked, Check). The file is parsed again here and
 *                                    never kept; the client's preview is not trusted.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const limited = limitByIp(request, 'portfolio-import', { max: 30, windowMs: 3_600_000 });
    if (limited !== null) return limited;
    const body = await parseBody(request, importBodySchema);
    if (!body.ok) return body.response;
    if (!body.data.commit) {
      const preview = await previewPortfolioImport(body.data.text);
      return preview.ok
        ? ok(preview.preview)
        : jsonError(preview.message, preview.status, { code: preview.code });
    }
    const outcome = await commitPortfolioImport(body.data);
    if (!outcome.ok) {
      return jsonError(outcome.message, outcome.status, {
        code: outcome.code,
        ...(outcome.remedy === undefined ? {} : { remedy: outcome.remedy }),
      });
    }
    return ok(outcome, 201);
  });
}
