import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../context.js';
import type { CredentialMinter, CredentialStrategy, WorkerCredential } from '../credentials.js';
import type { Logger } from '../log.js';
import { refreshProviderCredential } from './refresh-credential.js';

const db = vi.hoisted(() => ({
  rows: new Map<string, WorkerCredential & { providerId: string; updatedAt: Date }>(),
  get: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@equitywise/db', () => ({
  getProviderCredential: db.get,
  saveProviderCredential: db.save,
}));

const now = new Date('2026-09-17T01:35:00.000Z'); // 07:05 IST
const later = new Date(now.getTime() + 20 * 60 * 60 * 1_000);

/** A strategy whose minter is scripted, so the job's own logic is what is tested. */
function strategy(
  providerId: string,
  options: {
    configured?: boolean;
    nightlyRollover?: boolean;
    ensure?: CredentialMinter['ensure'];
  } = {},
): CredentialStrategy & { ensure: ReturnType<typeof vi.fn> } {
  const ensure = vi.fn(
    options.ensure ??
      (async (store) => {
        // Mirrors the real `ensureCredential`: a mint is stored before it is returned.
        const credential = { accessToken: `${providerId}-minted`, expiresAt: later, appId: 'app' };
        await store.write(credential);
        return { credential, refreshed: true, via: 'minted' as const };
      }),
  );
  return {
    providerId,
    tokenEnvVar: `${providerId.toUpperCase()}_ACCESS_TOKEN`,
    manualRemedy: `log in to ${providerId} by hand`,
    mintRemedy: `check the ${providerId} secrets`,
    nightlyRollover: options.nightlyRollover ?? false,
    minter: () => (options.configured === false ? null : { ensure }),
    ensure,
  };
}

function harness(strategies: CredentialStrategy[]) {
  const tokens = new Map<string, string>();
  const context = {
    db: {},
    providerId: strategies[0]?.providerId ?? 'none',
    providers: new Map(strategies.map((s) => [s.providerId, {}])),
    credentialStrategies: strategies,
    setAccessToken: (providerId: string, token: string) => {
      tokens.set(providerId, token);
    },
  } as unknown as WorkerContext;
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  log.child.mockReturnValue(log);
  return { context, log: log as unknown as Logger, logCalls: log, tokens };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.rows.clear();
  db.get.mockImplementation(async (_db: unknown, providerId: string) => {
    return db.rows.get(providerId) ?? null;
  });
  db.save.mockImplementation(
    async (_db: unknown, input: WorkerCredential & { providerId: string }) => {
      db.rows.set(input.providerId, { ...input, updatedAt: now });
    },
  );
});

describe('refreshProviderCredential', () => {
  it('refreshes every held provider under its own row and applies each token', async () => {
    const fyers = strategy('fyers');
    const dhan = strategy('dhan', { nightlyRollover: true });
    const { context, log, tokens } = harness([fyers, dhan]);

    const results = await refreshProviderCredential(context, log, { now });

    expect(results.map((r) => [r.providerId, r.via, r.refreshed])).toEqual([
      ['fyers', 'minted', true],
      ['dhan', 'minted', true],
    ]);
    expect(tokens.get('fyers')).toBe('fyers-minted');
    expect(tokens.get('dhan')).toBe('dhan-minted');
    // Each strategy was handed a store scoped to ITS provider id.
    expect(db.save.mock.calls.map((c) => (c[1] as { providerId: string }).providerId)).toEqual([
      'fyers',
      'dhan',
    ]);
  });

  it('limits the self-heal to the provider whose token was rejected', async () => {
    const fyers = strategy('fyers');
    const dhan = strategy('dhan');
    const { context, log } = harness([fyers, dhan]);

    const results = await refreshProviderCredential(context, log, { now, providerId: 'dhan' });

    expect(results.map((r) => r.providerId)).toEqual(['dhan']);
    expect(fyers.ensure).not.toHaveBeenCalled();
    expect(dhan.ensure).toHaveBeenCalledOnce();
  });

  it('runs the nightly rollover only for providers that asked for it', async () => {
    const fyers = strategy('fyers', { nightlyRollover: false });
    const dhan = strategy('dhan', { nightlyRollover: true });
    const { context, log } = harness([fyers, dhan]);

    const results = await refreshProviderCredential(context, log, { now, rolloverOnly: true });

    expect(results.map((r) => r.providerId)).toEqual(['dhan']);
    expect(fyers.ensure).not.toHaveBeenCalled();
  });

  it('adopts a stored, still-valid token when no secrets are configured', async () => {
    const dhan = strategy('dhan', { configured: false });
    db.rows.set('dhan', {
      providerId: 'dhan',
      accessToken: 'pasted-by-hand',
      expiresAt: later,
      appId: 'client',
      updatedAt: now,
    });
    const { context, log, tokens } = harness([dhan]);

    const [result] = await refreshProviderCredential(context, log, { now });

    expect(result).toEqual({ providerId: 'dhan', refreshed: false, skipped: true, via: 'stored' });
    expect(tokens.get('dhan')).toBe('pasted-by-hand');
    expect(dhan.ensure).not.toHaveBeenCalled();
  });

  it('warns with the manual remedy when nothing usable exists and nothing can mint', async () => {
    const dhan = strategy('dhan', { configured: false });
    db.rows.set('dhan', {
      providerId: 'dhan',
      accessToken: 'dead',
      expiresAt: new Date(now.getTime() - 1),
      appId: 'client',
      updatedAt: now,
    });
    const { context, log, logCalls, tokens } = harness([dhan]);

    const [result] = await refreshProviderCredential(context, log, { now });

    expect(result).toEqual({ providerId: 'dhan', refreshed: false, skipped: true });
    expect(tokens.has('dhan')).toBe(false);
    expect(logCalls.warn).toHaveBeenCalledWith(
      'no usable credential and unattended login is not configured',
      expect.objectContaining({ remedy: 'log in to dhan by hand' }),
    );
  });

  it('keeps going past a failed provider and rethrows the first failure afterwards', async () => {
    const boom = new Error('Invalid TOTP');
    const fyers = strategy('fyers', {
      ensure: async () => {
        throw boom;
      },
    });
    const dhan = strategy('dhan');
    const { context, log, logCalls, tokens } = harness([fyers, dhan]);

    await expect(refreshProviderCredential(context, log, { now })).rejects.toBe(boom);

    // Dhan was still refreshed despite Fyers failing first.
    expect(dhan.ensure).toHaveBeenCalledOnce();
    expect(tokens.get('dhan')).toBe('dhan-minted');
    expect(tokens.has('fyers')).toBe(false);
    expect(logCalls.error).toHaveBeenCalledWith(
      'credential refresh failed; a manual login is required',
      expect.objectContaining({ remedy: 'check the fyers secrets', errorMessage: 'Invalid TOTP' }),
    );
  });

  it('never writes a token or a fragment of one to the log', async () => {
    const dhan = strategy('dhan');
    const { context, log, logCalls } = harness([dhan]);

    await refreshProviderCredential(context, log, { now });

    const logged = JSON.stringify([
      ...logCalls.info.mock.calls,
      ...logCalls.warn.mock.calls,
      ...logCalls.error.mock.calls,
    ]);
    expect(logged).not.toContain('dhan-minted');
  });
});
