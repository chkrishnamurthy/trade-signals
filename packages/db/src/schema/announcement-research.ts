import type { AnnouncementInterpretation, AnnouncementText } from '@equitywise/core';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { authUsers } from './auth.js';
import { corporateAnnouncements } from './disclosures.js';

export interface AnnouncementSnapshot extends AnnouncementText {
  readonly source: string;
  readonly externalId: string;
  readonly symbol: string;
  readonly companyName: string;
  readonly attachmentUrl: string | null;
  readonly announcedAt: string;
}

/** Immutable evidence versions; current announcement row is only the latest read projection. */
export const announcementVersions = pgTable(
  'announcement_versions',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    announcementId: bigint({ mode: 'number' })
      .notNull()
      .references(() => corporateAnnouncements.id),
    snapshot: jsonb().$type<AnnouncementSnapshot>().notNull(),
    /** SHA-256 of metadata + method; not a document checksum. Null on preserved legacy rows. */
    checksum: text(),
    interpretation: jsonb().$type<AnnouncementInterpretation>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('announcement_versions_item_idx').on(table.announcementId, table.id.desc())],
);

/** Completed attempts, including failure and empty success; no claim of full source coverage. */
export const announcementIngestionRuns = pgTable(
  'announcement_ingestion_runs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    source: text().notNull(),
    succeeded: boolean().notNull(),
    fetched: integer().notNull(),
    written: integer().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    completedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [index('announcement_ingestion_runs_completed_idx').on(table.completedAt.desc())],
);

/** Only this announcement table is writable by the web app; every query uses ownerId. */
export const announcementUserState = pgTable(
  'announcement_user_state',
  {
    ownerId: integer()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    announcementId: bigint({ mode: 'number' })
      .notNull()
      .references(() => corporateAnnouncements.id, { onDelete: 'cascade' }),
    read: boolean().notNull().default(false),
    readChecksum: text(),
    saved: boolean().notNull().default(false),
    dismissed: boolean().notNull().default(false),
    issueReported: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.announcementId] })],
);
