import { getAvatarUrl, updateProfile } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';
import {
  deleteAvatarByUrl,
  detectImageKind,
  MAX_AVATAR_BYTES,
  saveAvatar,
} from '@/server/profile/avatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/profile/avatar — upload a new avatar (multipart form field `file`).
 * The type is decided by the file's magic bytes, not its claimed content-type;
 * the previous avatar file is removed after the new path is stored.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });

  const user = await getSessionUser();
  if (user === null) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected a file upload.', 400, { code: 'INVALID_BODY' });
  }
  const file = form.get('file');
  if (!(file instanceof Blob)) return fail('No file was provided.', 400, { code: 'NO_FILE' });
  if (file.size === 0) return fail('The file is empty.', 400, { code: 'EMPTY_FILE' });
  if (file.size > MAX_AVATAR_BYTES) {
    return fail('Image must be 2 MB or smaller.', 413, { code: 'FILE_TOO_LARGE' });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImageKind(bytes);
  if (kind === null) {
    return fail('Upload a PNG, JPEG, or WebP image.', 415, { code: 'UNSUPPORTED_TYPE' });
  }

  const db = getDatabase();
  const previous = await getAvatarUrl(db, user.id);
  const url = await saveAvatar(user.id, bytes, kind);
  await updateProfile(db, user.id, { avatarUrl: url });
  await deleteAvatarByUrl(previous);

  return json({ avatarUrl: url });
}

/** DELETE /api/profile/avatar — remove the avatar and fall back to the initials avatar. */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });

  const user = await getSessionUser();
  if (user === null) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });

  const db = getDatabase();
  const previous = await getAvatarUrl(db, user.id);
  await updateProfile(db, user.id, { avatarUrl: null });
  await deleteAvatarByUrl(previous);

  return json({ avatarUrl: null });
}
