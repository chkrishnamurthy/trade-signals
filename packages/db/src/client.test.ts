import { describe, expect, it, vi } from 'vitest';
import { withRetry } from './client.js';

/** Collapses the backoff so tests do not actually wait. */
const noSleep = async (): Promise<void> => {};

describe('withRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(operation, { sleep: noSleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries a cold-start failure and succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue('awake');

    await expect(withRetry(operation, { sleep: noSleep })).resolves.toBe('awake');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('gives up after the configured number of attempts and rethrows the last error', async () => {
    const failure = new Error('still asleep');
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(withRetry(operation, { attempts: 3, sleep: noSleep })).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('backs off exponentially, capped, with jitter above half the ceiling', async () => {
    const delays: number[] = [];
    const operation = vi.fn().mockRejectedValue(new Error('nope'));

    await expect(
      withRetry(operation, {
        attempts: 6,
        baseDelayMs: 100,
        maxDelayMs: 500,
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toThrow('nope');

    expect(delays).toHaveLength(5);
    const ceilings = [100, 200, 400, 500, 500];
    for (const [index, delay] of delays.entries()) {
      const ceiling = ceilings[index] ?? 0;
      expect(delay).toBeLessThanOrEqual(ceiling);
      expect(delay).toBeGreaterThanOrEqual(Math.floor(ceiling / 2));
    }
  });

  it('reports each retry to the caller for logging', async () => {
    const onRetry = vi.fn();
    const operation = vi.fn().mockRejectedValueOnce(new Error('cold')).mockResolvedValue(1);

    await withRetry(operation, { onRetry, sleep: noSleep });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toBe(1);
    expect(onRetry.mock.calls[0]?.[2]).toBeInstanceOf(Error);
  });

  it('does not sleep after the final attempt', async () => {
    const sleep = vi.fn(async () => {});
    await expect(
      withRetry(vi.fn().mockRejectedValue(new Error('x')), { attempts: 1, sleep }),
    ).rejects.toThrow('x');
    expect(sleep).not.toHaveBeenCalled();
  });
});
