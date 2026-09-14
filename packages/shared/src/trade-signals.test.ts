import { describe, expect, it } from 'vitest';
import { paperRequestSchema, signalQuerySchema } from './trade-signals.js';

describe('signal boundary contracts', () => {
  it('bounds pagination, direction, scores and UTC filters', () => {
    expect(signalQuerySchema.parse({}).pageSize).toBe(24);
    for (const value of [
      { page: 0 },
      { pageSize: 101 },
      { direction: 'long' },
      { minimumScore: 101 },
      { from: '2026-09-11' },
      { sortBy: 'sql' },
      { from: '2026-09-12T00:00:00Z', to: '2026-09-11T00:00:00Z' },
    ])
      expect(signalQuerySchema.safeParse(value).success).toBe(false);
  });
  it('rejects client ownership and fractional money', () => {
    const request = {
      signalId: 1,
      capitalPaise: 10_000_000,
      riskBps: 100,
      idempotencyKey: 'f607aef8-69c4-40b8-a6da-23be5ad72848',
    };
    expect(paperRequestSchema.parse(request).moveToBreakeven).toBe(false);
    expect(paperRequestSchema.safeParse({ ...request, userId: 2 }).success).toBe(false);
    expect(paperRequestSchema.safeParse({ ...request, capitalPaise: 100.2 }).success).toBe(false);
  });
});
