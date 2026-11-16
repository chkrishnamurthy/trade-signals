import { afterEach, describe, expect, it, vi } from 'vitest';
import { duplicateResponse, handle } from './api-response';
import { MarketDataError, UNEXPECTED_FAILURE_MESSAGE } from './errors';

/** What Drizzle throws for a duplicate key: SQL and params in the message, pg error as cause. */
function duplicate(constraint: string): Error {
  return Object.assign(new Error('Failed query: insert into "t" …\nparams: 7,Secret list'), {
    cause: Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint,
    }),
  });
}

async function run(error: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handle(async () => {
    throw error;
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('handle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names a duplicate watchlist as a watchlist', async () => {
    const { status, body } = await run(duplicate('watchlists_owner_name_idx'));
    expect(status).toBe(409);
    expect(body).toMatchObject({
      error: 'A watchlist with that name already exists.',
      code: 'DUPLICATE_NAME',
    });
  });

  it('does not call any other duplicate a watchlist', async () => {
    for (const constraint of [
      'saved_screens_owner_name_idx',
      'watchlist_views_owner_scope_name_idx',
      'holding_entries_owner_trade_idx',
    ]) {
      const { status, body } = await run(duplicate(constraint));
      expect(status).toBe(409);
      expect(String(body.error)).not.toContain('watchlist');
    }
    expect((await run(duplicate('holding_entries_owner_trade_idx'))).body.code).toBe('DUPLICATE');
  });

  it('keeps an internal failure out of the response and the parameters out of the log', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = Object.assign(
      new Error('Failed query: select * from "holding_entries"\nparams: 7,RELIANCE,245050'),
      { cause: new Error('Connection terminated unexpectedly') },
    );
    const { status, body } = await run(failure);
    expect(status).toBe(500);
    expect(body).toMatchObject({ error: UNEXPECTED_FAILURE_MESSAGE, code: 'UNKNOWN' });
    expect(JSON.stringify(body)).not.toContain('holding_entries');
    const line = logged.mock.calls.flat().join(' ');
    expect(line).toContain('Connection terminated unexpectedly');
    expect(line).not.toContain('RELIANCE');
    expect(line).not.toContain('245050');
  });

  it('still passes a deliberate, user-facing failure through unchanged', async () => {
    const { status, body } = await run(
      new MarketDataError('That watchlist no longer exists.', { code: 'NOT_FOUND', status: 404 }),
    );
    expect(status).toBe(404);
    expect(body).toMatchObject({ error: 'That watchlist no longer exists.', code: 'NOT_FOUND' });
  });
});

describe('duplicateResponse', () => {
  it('is neutral when the constraint is unknown or absent', async () => {
    for (const constraint of [null, 'some_future_idx']) {
      const body = (await duplicateResponse(constraint).json()) as Record<string, unknown>;
      expect(body).toMatchObject({ error: 'That already exists.', code: 'DUPLICATE' });
    }
  });
});
