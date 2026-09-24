import type { IssuedSession } from '@equitywise/api-contracts';
import * as SecureStore from 'expo-secure-store';

/**
 * The bearer session, kept in the Android Keystore via SecureStore — never
 * AsyncStorage, a file or a log line (docs/mobile/01-discovery.md §7.1).
 *
 * Also records when the token was last rotated so the app can swap it every
 * 7 days (`shouldRotate`).
 */

const KEY = 'ew.session.v1';
const BIOMETRIC_KEY = 'ew.biometric-lock.v1';

export interface StoredSession {
  readonly token: string;
  readonly expiresAt: string;
  readonly rotatedAt: string;
}

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'string') return null;
    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt,
      rotatedAt:
        typeof parsed.rotatedAt === 'string' ? parsed.rotatedAt : new Date(0).toISOString(),
    };
  } catch {
    // A corrupted or unreadable entry is treated as signed out.
    return null;
  }
}

export async function saveSession(
  session: IssuedSession,
  now = new Date(),
): Promise<StoredSession> {
  const stored: StoredSession = {
    token: session.token,
    expiresAt: session.expiresAt,
    rotatedAt: now.toISOString(),
  };
  await SecureStore.setItemAsync(KEY, JSON.stringify(stored), OPTIONS);
  return stored;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}

export async function biometricLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_KEY, OPTIONS)) === 'on';
}

export async function setBiometricLock(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(BIOMETRIC_KEY, 'on', OPTIONS);
  else await SecureStore.deleteItemAsync(BIOMETRIC_KEY, OPTIONS);
}
