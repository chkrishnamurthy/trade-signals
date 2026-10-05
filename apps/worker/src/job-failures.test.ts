import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobFailureRecorder, FAILURE_THROTTLE_MS, redactMessage } from './job-failures.js';

const dbMock = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@equitywise/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@equitywise/db')>()),
  ...dbMock,
}));

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.logEvent.mockResolvedValue(undefined);
});

describe('redactMessage', () => {
  it('removes credentials a provider might echo', () => {
    expect(redactMessage('GET failed: access_token=abc123def&x=1')).not.toContain('abc123def');
    expect(redactMessage('Authorization: Bearer sk-live-999')).not.toContain('sk-live-999');
    expect(redactMessage('bad jwt eyJhbGciOi.eyJzdWIiOi.abc_def-123')).toContain('[redacted-jwt]');
  });
  it('bounds the length', () => {
    expect(redactMessage('x'.repeat(2000)).length).toBe(300);
  });
  it('leaves an ordinary message alone', () => {
    expect(redactMessage('Request timed out after 30s')).toBe('Request timed out after 30s');
  });
});

describe('createJobFailureRecorder', () => {
  it('stores a worker/job_failed event with the job, duration and message', async () => {
    const record = createJobFailureRecorder(db, log as never, () => 1_000);
    await record('ingest-daily', new Error('provider down'), 4200);

    expect(dbMock.logEvent).toHaveBeenCalledWith(db, {
      category: 'worker',
      event: 'job_failed',
      actorType: 'worker',
      detail: { job: 'ingest-daily', durationMs: 4200, error: 'provider down', name: 'Error' },
    });
  });

  it('stores one failure per job per window, but each job separately', async () => {
    let t = 0;
    const record = createJobFailureRecorder(db, log as never, () => t);

    await record('quote-cycle', new Error('a'), 1);
    t += 60_000;
    await record('quote-cycle', new Error('b'), 1); // inside the window: dropped
    await record('other-job', new Error('c'), 1); // different job: stored
    t += FAILURE_THROTTLE_MS;
    await record('quote-cycle', new Error('d'), 1); // window passed: stored

    expect(dbMock.logEvent).toHaveBeenCalledTimes(3);
  });

  it('never throws when the log write itself fails', async () => {
    dbMock.logEvent.mockRejectedValue(new Error('db down'));
    const record = createJobFailureRecorder(db, log as never);
    await expect(record('job', new Error('x'), 1)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('handles a thrown non-Error', async () => {
    const record = createJobFailureRecorder(db, log as never);
    await record('job', 'plain string', 1);
    expect(dbMock.logEvent.mock.calls[0]?.[1].detail.name).toBe('NonError');
  });
});
