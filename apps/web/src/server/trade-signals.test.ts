import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  summary: vi.fn(),
  enrol: vi.fn(),
}));
vi.mock('./auth/require-user', () => ({ getSessionUser: mock.user }));
vi.mock('./db', () => ({ getDatabase: () => ({}) }));
vi.mock('@equitywise/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@equitywise/db')>()),
  listVwapSignals: mock.list,
  getVwapSignal: mock.detail,
  getSignalSummary: mock.summary,
  createPaperStudy: mock.enrol,
}));

import { enrolPaperStudy, readSignal, readSignals } from './trade-signals';

beforeEach(() => {
  vi.clearAllMocks();
  mock.user.mockResolvedValue({ id: 7 });
  mock.list.mockResolvedValue({});
});
describe('authenticated signals API', () => {
  it('rejects a stale or missing session before accessing signals', async () => {
    mock.user.mockResolvedValue(null);
    const r = await readSignals(new Request('http://localhost/api/signals'));
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(mock.list).not.toHaveBeenCalled();
  });
  it('scopes reads to the verified account, validates filters and disables caching', async () => {
    const r = await readSignals(new Request('http://localhost/api/signals?watchlistId=3'));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(mock.list.mock.calls[0]?.[1]).toBe(7);
    expect(
      (await readSignals(new Request('http://localhost/api/signals?pageSize=10000'))).status,
    ).toBe(400);
    expect((await readSignal('NaN')).status).toBe(400);
  });
  it('rejects cross-origin journal enrolment and ownership injection', async () => {
    const body = {
      signalId: 1,
      capitalPaise: 100000,
      riskBps: 100,
      idempotencyKey: crypto.randomUUID(),
    };
    const req = (origin: string, payload: unknown) =>
      new Request('http://localhost/api/paper-trades', {
        method: 'POST',
        headers: { origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    expect((await enrolPaperStudy(req('https://other.example', body))).status).toBe(403);
    expect((await enrolPaperStudy(req('http://localhost', { ...body, userId: 5 }))).status).toBe(
      400,
    );
    expect(mock.enrol).not.toHaveBeenCalled();
  });
});
