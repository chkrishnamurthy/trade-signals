import 'server-only';
import { defaultRatioKeys, normaliseRatioKeys } from '@equitywise/core';
import { deleteRatioLayout, getRatioLayout, saveRatioLayout } from '@equitywise/db';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';

/**
 * The stock page's ratio board layout (stock-header plan §5.3): one ordered
 * list of tile keys per user, shared by every stock. Validated against the
 * viewer's catalogue on write and again on read, so a metric later removed —
 * or one the viewer may not see — never renders.
 */

export interface RatioLayoutDto {
  readonly keys: readonly string[];
  /** False while the viewer is on the default layout. */
  readonly saved: boolean;
}

async function requireViewer(): Promise<{ userId: number; isAdmin: boolean }> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  return { userId: user.id, isAdmin: user.role === 'admin' };
}

/** The layout for a known viewer; the default (F&O-aware) when none is saved or it no longer validates. */
export async function ratioLayoutFor(
  viewer: { userId: number; isAdmin: boolean },
  fnoEligible: boolean,
): Promise<RatioLayoutDto> {
  const stored = await getRatioLayout(getDatabase(), viewer.userId);
  const keys = stored === null ? null : normaliseRatioKeys(stored, viewer.isAdmin);
  return keys === null
    ? { keys: defaultRatioKeys(fnoEligible), saved: false }
    : { keys, saved: true };
}

export async function getRatioLayoutForViewer(fnoEligible = false): Promise<RatioLayoutDto> {
  return ratioLayoutFor(await requireViewer(), fnoEligible);
}

export async function saveRatioLayoutForViewer(keys: readonly string[]): Promise<RatioLayoutDto> {
  const viewer = await requireViewer();
  const clean = normaliseRatioKeys(keys, viewer.isAdmin);
  if (clean === null || clean.length !== keys.length) {
    throw new MarketDataError('That layout names a ratio that does not exist.', {
      code: 'INVALID_LAYOUT',
      status: 400,
      remedy: 'Pick ratios from the list and try again.',
    });
  }
  await saveRatioLayout(getDatabase(), viewer.userId, clean);
  return { keys: clean, saved: true };
}

export async function resetRatioLayoutForViewer(fnoEligible = false): Promise<RatioLayoutDto> {
  const viewer = await requireViewer();
  await deleteRatioLayout(getDatabase(), viewer.userId);
  return { keys: defaultRatioKeys(fnoEligible), saved: false };
}
