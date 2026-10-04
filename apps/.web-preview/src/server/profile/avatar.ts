import 'server-only';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Avatar files on disk. The DB stores only a path; the bytes live on the VPS
 * filesystem and are served back through `/api/avatars/<file>`.
 *
 * SECURITY: the type is decided by the file's own magic bytes (never the client
 * `Content-Type` or filename), the size is capped, and stored filenames are
 * random — the client filename is discarded, so path traversal is impossible on
 * write. Reads sanitise the filename and confirm the resolved path stays inside
 * the avatar directory.
 *
 * NOT DONE HERE (documented follow-up): server-side re-encode to a normalised
 * 256×256 WebP with metadata (EXIF/GPS) stripped. That needs an image library
 * (`sharp`); until it lands, uploads are stored as received after strict
 * validation, so treat avatars as public and don't rely on EXIF being gone.
 */

/** 2 MiB — comfortably more than a normalised avatar, tight enough to abuse-cap. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const PUBLIC_AVATAR_PREFIX = '/api/avatars/';

type ImageKind = { ext: 'png' | 'jpg' | 'webp'; contentType: string };

const EXT_CONTENT_TYPE: Record<ImageKind['ext'], string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** Identify PNG / JPEG / WebP from the leading bytes, or null if it is neither. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { ext: 'png', contentType: EXT_CONTENT_TYPE.png };
  }
  // JPEG: FF D8 FF
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: EXT_CONTENT_TYPE.jpg };
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: 'webp', contentType: EXT_CONTENT_TYPE.webp };
  }
  return null;
}

/** Absolute path to the avatar directory. Overridable for prod via env. */
function avatarDir(): string {
  return process.env.AVATAR_UPLOAD_DIR ?? join(process.cwd(), 'uploads', 'avatars');
}

/** Only ever a stored basename: `<digits>-<hex>.<ext>`. Rejects anything else. */
const STORED_NAME = /^[0-9]+-[0-9a-f]{16}\.(png|jpg|webp)$/;

/** Write the bytes under a random name and return the public URL to store. */
export async function saveAvatar(
  userId: number,
  bytes: Uint8Array,
  kind: ImageKind,
): Promise<string> {
  const dir = avatarDir();
  await mkdir(dir, { recursive: true });
  const filename = `${userId}-${randomBytes(8).toString('hex')}.${kind.ext}`;
  await writeFile(join(dir, filename), bytes, { flag: 'wx' });
  return `${PUBLIC_AVATAR_PREFIX}${filename}`;
}

/** Best-effort delete of a previously stored avatar, given its public URL. */
export async function deleteAvatarByUrl(url: string | null): Promise<void> {
  if (url === null || !url.startsWith(PUBLIC_AVATAR_PREFIX)) return;
  const name = url.slice(PUBLIC_AVATAR_PREFIX.length);
  if (!STORED_NAME.test(name)) return;
  try {
    await unlink(join(avatarDir(), name));
  } catch {
    // Already gone / never written — nothing to clean up.
  }
}

/** Read a stored avatar for serving. Null when the name is invalid or missing. */
export async function readAvatar(
  name: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!STORED_NAME.test(name)) return null;
  const dir = avatarDir();
  const path = resolve(dir, name);
  // Defence in depth: the resolved path must stay inside the avatar directory.
  if (!path.startsWith(resolve(dir))) return null;
  const ext = name.slice(name.lastIndexOf('.') + 1) as ImageKind['ext'];
  try {
    const bytes = await readFile(path);
    return { bytes, contentType: EXT_CONTENT_TYPE[ext] };
  } catch {
    return null;
  }
}
