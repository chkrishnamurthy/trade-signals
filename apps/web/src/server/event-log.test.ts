import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./db', () => ({ getDatabase: () => ({}) }));

const { eventLogQuerySchema } = await import('./event-log');

describe('eventLogQuerySchema', () => {
  it('accepts an empty query and a full one', () => {
    expect(eventLogQuerySchema.safeParse({}).success).toBe(true);
    const full = eventLogQuerySchema.safeParse({
      category: 'worker',
      event: 'job_failed',
      userId: '12',
      from: '2026-10-01',
      to: '2026-10-05',
      beforeId: '400',
    });
    expect(full.success).toBe(true);
    if (full.success) expect(full.data.userId).toBe(12);
  });
  it('rejects an unknown category and a malformed date', () => {
    expect(eventLogQuerySchema.safeParse({ category: 'everything' }).success).toBe(false);
    expect(eventLogQuerySchema.safeParse({ from: '05/10/2026' }).success).toBe(false);
    expect(eventLogQuerySchema.safeParse({ userId: '-3' }).success).toBe(false);
  });
});
