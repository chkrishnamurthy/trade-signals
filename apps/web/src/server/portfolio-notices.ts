import 'server-only';
import {
  getNoticeSettings,
  listNotices,
  markNoticesRead,
  saveNoticeSettings,
  unreadNoticeCount,
} from '@equitywise/db';
import { z } from 'zod';
import type { NoticeDto, NoticeSettingsDto, PortfolioNoticesDto } from '@/lib/portfolio-types';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';

/**
 * Portfolio phase 6.2: the signed-in user's in-app notices about their own
 * holdings, and which they get. Owner-scoped in the repository (rule 9).
 */

async function requireOwnerId(): Promise<number> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  return user.id;
}

const KINDS = new Set([
  'event_soon',
  'share_change',
  'stock_move',
  'portfolio_move',
  'long_term_soon',
]);

export async function getNotices(): Promise<PortfolioNoticesDto> {
  const ownerId = await requireOwnerId();
  const db = getDatabase();
  const [rows, unread, settings] = await Promise.all([
    listNotices(db, ownerId),
    unreadNoticeCount(db, ownerId),
    getNoticeSettings(db, ownerId),
  ]);
  const notices: NoticeDto[] = rows
    .filter((r) => KINDS.has(r.kind))
    .map((r) => ({
      id: r.id,
      kind: r.kind as NoticeDto['kind'],
      noticeDate: r.noticeDate,
      data: r.data as NoticeDto['data'],
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
    }));
  return { notices, unread, settings };
}

/** The unread count for the header; zero when signed out. */
export async function getUnreadNoticeCount(): Promise<number> {
  const user = await getSessionUser();
  if (user === null) return 0;
  return unreadNoticeCount(getDatabase(), user.id);
}

export const markReadSchema = z.object({
  /** The notices to mark; all of the user's when left out. */
  ids: z.array(z.number().int().positive()).max(500).optional(),
});

export async function markRead(body: z.infer<typeof markReadSchema>): Promise<number> {
  const ownerId = await requireOwnerId();
  return markNoticesRead(getDatabase(), ownerId, body.ids);
}

const percent = z
  .number({ invalid_type_error: 'Enter a whole percent.' })
  .int('Enter a whole percent.')
  .min(1, 'Use 1% or more.')
  .max(50, 'Use 50% or less.');

export const settingsSchema = z.object({
  events: z.boolean(),
  shareChanges: z.boolean(),
  stockMoves: z.boolean(),
  stockMovePercent: percent,
  portfolioMoves: z.boolean(),
  portfolioMovePercent: percent,
  longTerm: z.boolean(),
  longTermDays: z
    .number({ invalid_type_error: 'Enter a number of days.' })
    .int('Enter whole days.')
    .min(1, 'Use 1 day or more.')
    .max(90, 'Use 90 days or fewer.'),
});

export async function saveSettings(body: NoticeSettingsDto): Promise<NoticeSettingsDto> {
  const ownerId = await requireOwnerId();
  await saveNoticeSettings(getDatabase(), ownerId, body);
  return body;
}
