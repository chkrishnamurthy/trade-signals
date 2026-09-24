import { type AppConfig, compareVersions } from '@equitywise/api-contracts';

/** Pure: does this install need (or merely have) an update? Unit-tested. */
export type UpdateState = 'required' | 'available' | 'current';

export function updateState(installed: string, config: AppConfig['android']): UpdateState {
  if (compareVersions(installed, config.minSupportedVersion) < 0) return 'required';
  if (compareVersions(installed, config.latestVersion) < 0) return 'available';
  return 'current';
}
