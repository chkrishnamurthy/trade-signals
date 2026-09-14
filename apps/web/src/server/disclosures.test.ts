import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  watched: vi.fn(),
  feed: vi.fn(),
  categories: vi.fn(),
  health: vi.fn(),
  states: vi.fn(),
  membership: vi.fn(),
  update: vi.fn(),
  history: vi.fn(),
}));
vi.mock('./auth/require-user', () => ({ getSessionUser: mock.user }));
vi.mock('./db', () => ({ getDatabase: () => ({}) }));
vi.mock('@equitywise/db', async (original) => ({
  ...(await original<typeof import('@equitywise/db')>()),
  listOwnerWatchedInstrumentIds: mock.watched,
  getAnnouncements: mock.feed,
  listAnnouncementCategories: mock.categories,
  announcementIngestionHealth: mock.health,
  announcementStatesForOwner: mock.states,
  watchlistMembershipForOwner: mock.membership,
  updateAnnouncementState: mock.update,
  getAnnouncementVersions: mock.history,
}));

import { PATCH } from '../app/api/announcements/[id]/route';
import { getAnnouncementsPage, setAnnouncementUserState } from './disclosures';

const now = new Date('2026-09-14T10:00:00Z');
beforeEach(() => {
  vi.clearAllMocks();
  mock.user.mockResolvedValue({ id: 7 });
  mock.watched.mockResolvedValue([]);
  mock.feed.mockResolvedValue({ rows: [], total: 0 });
  mock.categories.mockResolvedValue([]);
  mock.health.mockResolvedValue({ latest: null, successful: null });
  mock.states.mockResolvedValue([]);
  mock.membership.mockResolvedValue(new Map());
  mock.update.mockResolvedValue(true);
});
describe('announcement ownership and coverage', () => {
  it('rejects unauthenticated reads and writes before accessing announcements', async () => {
    mock.user.mockResolvedValue(null);
    await expect(getAnnouncementsPage()).rejects.toMatchObject({ status: 401 });
    await expect(setAnnouncementUserState(1, { read: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(mock.feed).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('keeps an empty watchlist scope empty rather than returning every company', async () => {
    const result = await getAnnouncementsPage({ watchlistOnly: true }, now);
    expect(mock.feed.mock.calls[0]?.[1]).toMatchObject({ ownerId: 7, instrumentIds: [] });
    expect(result.watchlistOnly).toBe(true);
    expect(result.coverage.lastSuccess).toBeNull();
  });
  it('passes the authenticated owner to all personalization reads and writes', async () => {
    await getAnnouncementsPage({ state: 'saved' }, now);
    expect(mock.feed.mock.calls[0]?.[1]).toMatchObject({ ownerId: 7, state: 'saved' });
    expect(mock.states.mock.calls[0]?.[1]).toBe(7);
    expect(mock.membership.mock.calls[0]?.[1]).toBe(7);
    await setAnnouncementUserState(10, { saved: true });
    expect(mock.update).toHaveBeenCalledWith({}, 7, 10, { saved: true });
    mock.user.mockResolvedValue({ id: 8 });
    await setAnnouncementUserState(10, { read: true });
    expect(mock.update).toHaveBeenLastCalledWith({}, 8, 10, { read: true });
  });
  it('reports successful empty ingestion independently of feed filters', async () => {
    mock.health.mockResolvedValue({
      latest: { succeeded: true, completedAt: now },
      successful: { completedAt: now },
    });
    const result = await getAnnouncementsPage({}, now);
    expect(result.coverage).toMatchObject({
      failed: false,
      stale: false,
      lastSuccess: now.toISOString(),
    });
    expect(result.rows).toEqual([]);
  });
  it('keeps last success visible after a failed attempt', async () => {
    mock.health.mockResolvedValue({
      latest: { succeeded: false, completedAt: now },
      successful: { completedAt: new Date('2026-09-10T00:00:00Z') },
    });
    expect((await getAnnouncementsPage({}, now)).coverage).toMatchObject({
      failed: true,
      stale: true,
    });
  });
  it('rejects unsupported filters', async () => {
    await expect(getAnnouncementsPage({ eventStatus: 'PROFITABLE' })).rejects.toMatchObject({
      status: 400,
    });
    expect(mock.feed).not.toHaveBeenCalled();
  });
});
describe('announcement state endpoint', () => {
  const request = (body: unknown, origin = 'http://localhost') =>
    new Request('http://localhost/api/announcements/10', {
      method: 'PATCH',
      headers: { origin, host: 'localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const context = { params: Promise.resolve({ id: '10' }) };
  it('rejects ownership injection and cross-origin state writes', async () => {
    expect((await PATCH(request({ read: true, ownerId: 8 }), context)).status).toBe(400);
    expect((await PATCH(request({ read: true }, 'https://other.example'), context)).status).toBe(
      403,
    );
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('accepts only a nonempty state patch and disables caching', async () => {
    expect((await PATCH(request({}), context)).status).toBe(400);
    const result = await PATCH(request({ read: true }), context);
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
  });
  it('returns not found for a missing announcement and rejects unsafe IDs', async () => {
    mock.update.mockResolvedValue(false);
    expect((await PATCH(request({ saved: true }), context)).status).toBe(404);
    await expect(
      setAnnouncementUserState(Number.MAX_SAFE_INTEGER + 1, { read: true }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
