import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  announcementIngestionRuns,
  announcementUserState,
  announcementVersions,
  corporateAnnouncements,
} from '../schema/index.js';

export async function recordAnnouncementIngestion(
  db: Database,
  input: typeof announcementIngestionRuns.$inferInsert,
): Promise<void> {
  await db.insert(announcementIngestionRuns).values(input);
}
export async function announcementIngestionHealth(db: Database) {
  const [latest, successful] = await Promise.all([
    db
      .select()
      .from(announcementIngestionRuns)
      .orderBy(desc(announcementIngestionRuns.completedAt))
      .limit(1),
    db
      .select()
      .from(announcementIngestionRuns)
      .where(eq(announcementIngestionRuns.succeeded, true))
      .orderBy(desc(announcementIngestionRuns.completedAt))
      .limit(1),
  ]);
  return { latest: latest[0] ?? null, successful: successful[0] ?? null };
}
export async function announcementStatesForOwner(
  db: Database,
  ownerId: number,
  ids: readonly number[],
) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(announcementUserState)
    .where(
      and(
        eq(announcementUserState.ownerId, ownerId),
        inArray(announcementUserState.announcementId, [...ids]),
      ),
    );
}
export interface AnnouncementStatePatch {
  read?: boolean | undefined;
  saved?: boolean | undefined;
  dismissed?: boolean | undefined;
  issueReported?: boolean | undefined;
}
export async function updateAnnouncementState(
  db: Database,
  ownerId: number,
  announcementId: number,
  patch: AnnouncementStatePatch,
): Promise<boolean> {
  const [item] = await db
    .select({
      id: corporateAnnouncements.id,
      checksum: corporateAnnouncements.interpretationChecksum,
    })
    .from(corporateAnnouncements)
    .where(eq(corporateAnnouncements.id, announcementId))
    .limit(1);
  if (item === undefined) return false;
  const readVersion =
    patch.read === undefined ? {} : { readChecksum: patch.read ? item.checksum : null };
  await db
    .insert(announcementUserState)
    .values({ ownerId, announcementId, ...patch, ...readVersion })
    .onConflictDoUpdate({
      target: [announcementUserState.ownerId, announcementUserState.announcementId],
      set: { ...patch, ...readVersion, updatedAt: new Date() },
    });
  return true;
}
export async function getAnnouncementVersions(db: Database, announcementId: number) {
  return db
    .select()
    .from(announcementVersions)
    .where(eq(announcementVersions.announcementId, announcementId))
    .orderBy(desc(announcementVersions.id))
    .limit(50);
}
export async function announcementsPendingInterpretation(db: Database, method: string) {
  // Parameterized raw predicate avoids repeatedly reinterpreting already-current metadata.
  return db
    .select()
    .from(corporateAnnouncements)
    .where(sql`${corporateAnnouncements.interpretation}->>'method' IS DISTINCT FROM ${method}`)
    .orderBy(desc(corporateAnnouncements.id))
    .limit(100);
}
