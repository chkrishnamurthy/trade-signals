import { describe, expect, it } from 'vitest';
import { updateState } from './update-gate';

const cfg = { minSupportedVersion: '1.2.0', latestVersion: '1.4.1', storeUrl: 'https://x.io' };

describe('update gate', () => {
  it('blocks installs below the minimum', () => {
    expect(updateState('1.1.9', cfg)).toBe('required');
  });
  it('nudges installs below the latest', () => {
    expect(updateState('1.2.0', cfg)).toBe('available');
    expect(updateState('1.4.0', cfg)).toBe('available');
  });
  it('compares numerically, not as text', () => {
    expect(updateState('1.10.0', { ...cfg, latestVersion: '1.9.0' })).toBe('current');
  });
});
