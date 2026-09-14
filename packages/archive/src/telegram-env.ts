import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

/**
 * Shared local-only configuration for the Telegram archive scripts. Everything
 * here stays on this Mac: the API credentials come from the gitignored root
 * `.env`, and the login session plus downloaded files live under the gitignored
 * `.archive-data/` directory. Nothing here is imported by the web app or worker.
 */

// packages/archive/src/ -> repo root is three levels up.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENV_PATH = `${ROOT}.env`;

export const ARCHIVE_ROOT = `${ROOT}.archive-data`;
export const SESSION_PATH = `${ARCHIVE_ROOT}/secrets/telegram-session.txt`;
export const OBJECTS_DIR = `${ARCHIVE_ROOT}/objects`;

/**
 * The one configured channel, from the link the operator supplied
 * (https://web.telegram.org/a/#-1001751394648). Overridable via env only for
 * testing; the old plan's NFO_DAILY_DATA is deliberately never a default.
 */
export const CHANNEL_ID = process.env.TELEGRAM_CHANNEL ?? '-1001751394648';

loadEnv({ path: ENV_PATH });

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
}

/** Read and validate the Telegram API credentials from `.env`. */
export function loadTelegramConfig(): TelegramConfig {
  const rawId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!rawId || !apiHash) {
    throw new Error('Missing TELEGRAM_API_ID / TELEGRAM_API_HASH in .env');
  }
  const apiId = Number(rawId);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new Error(`TELEGRAM_API_ID must be a positive integer, got: ${rawId}`);
  }
  return { apiId, apiHash };
}

/** Read the saved session string, or '' if none exists yet. */
export async function readSavedSession(): Promise<string> {
  try {
    return (await readFile(SESSION_PATH, 'utf8')).trim();
  } catch {
    return '';
  }
}

/** Persist the session string with owner-only permissions. */
export async function saveSession(session: string): Promise<void> {
  await mkdir(dirname(SESSION_PATH), { recursive: true, mode: 0o700 });
  await writeFile(SESSION_PATH, session, { mode: 0o600 });
}

/** Build a client bound to the given (possibly empty) session string. */
export function createClient(sessionString: string): TelegramClient {
  const { apiId, apiHash } = loadTelegramConfig();
  return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
  });
}
