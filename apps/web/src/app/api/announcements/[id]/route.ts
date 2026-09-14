import { announcementStateSchema } from '@/server/announcement-schemas';
import { isSameOrigin } from '@/server/auth/request';
import { announcementHistory, setAnnouncementUserState } from '@/server/disclosures';
import { handle, jsonError, ok, parseBody } from '@/server/watchlist-routes';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handle(async () => ok(await announcementHistory(Number((await context.params).id))));
}
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    if (!isSameOrigin(request))
      return jsonError('Request origin is not allowed.', 403, { code: 'INVALID_ORIGIN' });
    const body = await parseBody(request, announcementStateSchema);
    if (!body.ok) return body.response;
    await setAnnouncementUserState(Number((await context.params).id), body.data);
    return ok({ updated: true });
  });
}
