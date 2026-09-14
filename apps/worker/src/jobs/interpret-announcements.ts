import { createHash } from 'node:crypto';
import { ANNOUNCEMENT_METHOD, interpretAnnouncement } from '@equitywise/core';
import {
  type AnnouncementUpsert,
  announcementsPendingInterpretation,
  upsertAnnouncements,
} from '@equitywise/db';
import type { WorkerContext } from '../context.js';

export function withAnnouncementInterpretation(row: AnnouncementUpsert): AnnouncementUpsert {
  const interpretation = interpretAnnouncement(row);
  const snapshot = {
    source: row.source,
    externalId: row.externalId,
    symbol: row.symbol,
    companyName: row.companyName,
    category: row.category,
    headline: row.headline,
    detail: row.detail,
    attachmentUrl: row.attachmentUrl,
    announcedAt: row.announcedAt.toISOString(),
  };
  const interpretationChecksum = createHash('sha256')
    .update(JSON.stringify({ snapshot, method: ANNOUNCEMENT_METHOD }))
    .digest('hex');
  return {
    ...snapshot,
    announcedAt: row.announcedAt,
    instrumentId: row.instrumentId,
    interpretation,
    interpretationChecksum,
  };
}

/** Bounded processing of already-stored metadata, even when the external feed is unavailable. */
export async function interpretPendingAnnouncements(context: WorkerContext): Promise<number> {
  const rows = await announcementsPendingInterpretation(context.db, ANNOUNCEMENT_METHOD);
  return upsertAnnouncements(context.db, rows.map(withAnnouncementInterpretation));
}
