import { NextResponse } from 'next/server';
import { readAvatar } from '@/server/profile/avatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/avatars/<file> — serve a stored avatar.
 *
 * The filename is validated against the stored-name pattern and the resolved path
 * is confined to the avatar directory (both in `readAvatar`), so this cannot read
 * arbitrary files. In production Nginx can serve the upload directory directly and
 * short-circuit this route; it exists so avatars also work in local dev.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<NextResponse> {
  const { file } = await params;
  const avatar = await readAvatar(file);
  if (avatar === null) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(avatar.bytes), {
    status: 200,
    headers: {
      'Content-Type': avatar.contentType,
      // Immutable: the filename changes on every upload, so this file never does.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
