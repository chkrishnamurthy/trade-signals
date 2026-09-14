import { randomUUID } from 'node:crypto';
import { interpretAnnouncement } from '@equitywise/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import { createDatabase, type DatabaseHandle } from '../client.js';
import {
  announcementStatesForOwner,
  getAnnouncementVersions,
  updateAnnouncementState,
} from '../repositories/announcement-research.js';
import {
  type AnnouncementUpsert,
  getAnnouncements,
  upsertAnnouncements,
} from '../repositories/disclosures.js';
import { announcementVersions, authUsers } from '../schema/index.js';

// Use the same guarded local database that Vitest global setup migrates.
const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;
suite('announcement persistence on real PostgreSQL', () => {
  let handle: DatabaseHandle;
  let owner: number;
  let other: number;
  const suffix = randomUUID();
  const fixture = (name: string): AnnouncementUpsert => ({
    source: 'bse',
    externalId: `${suffix}-${name}`,
    instrumentId: null,
    symbol: 'TEST',
    companyName: 'Example',
    headline: 'Dividend',
    category: 'Dividend',
    detail: 'Dividend per share: ₹2',
    attachmentUrl: 'https://www.bseindia.com/test.pdf',
    announcedAt: new Date('2026-09-14T10:00:00Z'),
    interpretation: interpretAnnouncement({
      headline: 'Dividend',
      detail: 'Dividend per share: ₹2',
      category: 'Dividend',
    }),
    interpretationChecksum: 'a'.repeat(64),
  });
  const itemId = async (row: AnnouncementUpsert) =>
    (await getAnnouncements(handle.db, { source: row.source, search: row.companyName })).rows.find(
      (item) => item.externalId === row.externalId,
    )!.id;
  beforeAll(async () => {
    handle = createDatabase({ connectionString: url, max: 4 });
    const users = await handle.db
      .insert(authUsers)
      .values([{ email: `${suffix}-one@test.example` }, { email: `${suffix}-two@test.example` }])
      .returning();
    owner = users[0]!.id;
    other = users[1]!.id;
  });
  afterAll(async () => {
    await handle?.close();
  });
  it('preserves retries, corrections, reversions and source evidence', async () => {
    const a = fixture('versions');
    await upsertAnnouncements(handle.db, [a]);
    const id = await itemId(a);
    await upsertAnnouncements(handle.db, [a]);
    expect(await getAnnouncementVersions(handle.db, id)).toHaveLength(1);
    await upsertAnnouncements(handle.db, [
      { ...a, detail: 'Dividend per share: ₹3', interpretationChecksum: 'b'.repeat(64) },
    ]);
    await upsertAnnouncements(handle.db, [a]);
    const versions = await getAnnouncementVersions(handle.db, id);
    expect(versions).toHaveLength(3);
    expect(versions[1]?.snapshot.detail).toBe('Dividend per share: ₹3');
    expect(versions[2]?.snapshot.attachmentUrl).toBe(a.attachmentUrl);
    expect(versions[2]?.snapshot.announcedAt).toBe(a.announcedAt.toISOString());
  });
  it('preserves an interpretation reprocessing version even when source text is unchanged', async () => {
    const a = fixture('method');
    await upsertAnnouncements(handle.db, [a]);
    const id = await itemId(a);
    await upsertAnnouncements(handle.db, [{ ...a, interpretationChecksum: 'c'.repeat(64) }]);
    expect(await getAnnouncementVersions(handle.db, id)).toHaveLength(2);
  });
  it('keeps different sources separate instead of merging similar titles', async () => {
    const a = fixture('sources');
    await upsertAnnouncements(handle.db, [a, { ...a, source: 'nse' }]);
    expect(await itemId(a)).not.toBe(await itemId({ ...a, source: 'nse' }));
  });
  it('isolates read/save/dismissal by owner, and makes a revised filing unread', async () => {
    const a = fixture('state');
    await upsertAnnouncements(handle.db, [a]);
    const id = await itemId(a);
    await updateAnnouncementState(handle.db, owner, id, { read: true, saved: true });
    expect(await announcementStatesForOwner(handle.db, other, [id])).toEqual([]);
    expect((await getAnnouncements(handle.db, { ownerId: owner, id, state: 'read' })).total).toBe(
      1,
    );
    expect((await getAnnouncements(handle.db, { ownerId: other, id, state: 'unread' })).total).toBe(
      1,
    );
    await upsertAnnouncements(handle.db, [
      { ...a, interpretationChecksum: 'd'.repeat(64), detail: 'Dividend per share: ₹4' },
    ]);
    expect((await getAnnouncements(handle.db, { ownerId: owner, id, state: 'unread' })).total).toBe(
      1,
    );
    await updateAnnouncementState(handle.db, owner, id, { dismissed: true });
    expect((await getAnnouncements(handle.db, { ownerId: owner, id })).total).toBe(0);
    expect((await getAnnouncements(handle.db, { ownerId: other, id })).total).toBe(1);
  });
  it('rejects mutation of evidence versions at the database boundary', async () => {
    const a = fixture('guards');
    await upsertAnnouncements(handle.db, [a]);
    const id = await itemId(a);
    await expect(
      handle.db
        .update(announcementVersions)
        .set({ checksum: 'changed' })
        .where(eq(announcementVersions.announcementId, id)),
    ).rejects.toThrow();
    await expect(
      handle.db.delete(announcementVersions).where(eq(announcementVersions.announcementId, id)),
    ).rejects.toThrow();
  });
  it('rolls back the whole ingestion batch when a foreign key is invalid', async () => {
    const a = fixture('atomic');
    const b = { ...fixture('atomic-b'), instrumentId: 2147483647 };
    await expect(upsertAnnouncements(handle.db, [a, b])).rejects.toThrow();
    expect(
      (await getAnnouncements(handle.db, { search: a.companyName })).rows.some(
        (row) => row.externalId === a.externalId,
      ),
    ).toBe(false);
  });
});
