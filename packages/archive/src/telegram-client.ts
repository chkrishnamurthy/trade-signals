import { mkdir, writeFile } from 'node:fs/promises';
import { Api, type TelegramClient } from 'telegram';
import { CHANNEL_ID, createClient, OBJECTS_DIR, readSavedSession } from './telegram-env.js';

/**
 * Shared read/download helpers over GramJS for the configured channel. Used by
 * the CLI scripts and the local dashboard so the connection, channel resolution
 * and file-listing logic live in one place. Local-only tooling.
 */

export interface FileRow {
  messageId: number;
  fileName: string;
  bytes: number;
  date: string;
}

/** Connect with the saved session, run `fn`, then always disconnect. */
export async function withClient<T>(fn: (client: TelegramClient) => Promise<T>): Promise<T> {
  const session = await readSavedSession();
  if (!session) {
    throw new Error('No saved session. Run: pnpm --filter @equitywise/archive tg:login');
  }
  const client = createClient(session);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

/** Resolve the one configured channel, falling back to a dialog scan. */
export async function resolveChannel(client: TelegramClient): Promise<Api.TypeEntityLike> {
  try {
    return (await client.getEntity(CHANNEL_ID)) as Api.TypeEntityLike;
  } catch {
    const dialogs = await client.getDialogs({});
    const entity = dialogs.find((d) => d.id?.toString() === CHANNEL_ID)?.entity;
    if (!entity) {
      throw new Error(`Channel ${CHANNEL_ID} not found in your dialogs.`);
    }
    return entity as Api.TypeEntityLike;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: GramJS message/document typings are loose at runtime.
export function fileNameOf(msg: any): string {
  const doc = msg?.document;
  // biome-ignore lint/suspicious/noExplicitAny: attribute union inspected structurally.
  const nameAttr = doc?.attributes?.find((a: any) => a.className === 'DocumentAttributeFilename');
  return nameAttr?.fileName ?? `message-${msg?.id}.bin`;
}

/** List document files in the channel, smallest first. */
export async function listFiles(client: TelegramClient, limit: number): Promise<FileRow[]> {
  const entity = await resolveChannel(client);
  const messages = await client.getMessages(entity, {
    limit,
    filter: new Api.InputMessagesFilterDocument(),
  });
  const rows: FileRow[] = [];
  for (const msg of messages) {
    // biome-ignore lint/suspicious/noExplicitAny: loose runtime shape.
    const doc = (msg as any).document;
    if (!doc) continue;
    rows.push({
      messageId: msg.id,
      fileName: fileNameOf(msg),
      bytes: Number(doc.size?.toString?.() ?? doc.size ?? 0),
      // biome-ignore lint/suspicious/noExplicitAny: loose runtime shape.
      date: new Date(((msg as any).date ?? 0) * 1000).toISOString(),
    });
  }
  rows.sort((a, b) => a.bytes - b.bytes);
  return rows;
}

export interface DownloadResult {
  fileName: string;
  path: string;
  bytes: number;
}

/** Download one message's document to the local objects dir. */
export async function downloadDocument(
  client: TelegramClient,
  messageId: number,
): Promise<{ result: DownloadResult; buffer: Buffer }> {
  const entity = await resolveChannel(client);
  const messages = await client.getMessages(entity, { ids: [messageId] });
  const msg = messages[0];
  if (!msg || !('document' in msg) || !msg.document) {
    throw new Error(`Message ${messageId} has no downloadable document.`);
  }
  const fileName = fileNameOf(msg);
  const media = await client.downloadMedia(msg, {});
  if (!media || typeof media === 'string') {
    throw new Error('Download did not return file bytes.');
  }
  const buffer = Buffer.from(media);
  await mkdir(OBJECTS_DIR, { recursive: true });
  const path = `${OBJECTS_DIR}/${fileName}`;
  await writeFile(path, buffer);
  return { result: { fileName, path, bytes: buffer.length }, buffer };
}
