import type { AppConfig, IssuedSession, SessionUser } from '@equitywise/api-contracts';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { api, onSessionEnded, setAuthToken } from './api';
import { deviceInfo } from './env';
import { pickGoogleAccount } from './google';
import { queryClient } from './query';
import { isExpired, shouldRotate } from './session-policy';
import {
  biometricLockEnabled,
  clearSession,
  loadSession,
  type StoredSession,
  saveSession,
  setBiometricLock,
} from './session-store';

/**
 * Who is signed in, and every way to change that (docs/mobile §7).
 *
 * The bearer token is read from the Keystore at launch — after the optional
 * biometric gate — and held in memory for the API client. A terminal 401 or a
 * disabled account wipes it and returns to sign-in: no retry, no silent re-login.
 */

export type AuthStatus = 'loading' | 'locked' | 'signed-out' | 'signed-in';

export interface MfaChallenge {
  readonly challengeId: string;
  readonly binding: string;
  readonly startedAt: number;
}

export type SignInOutcome =
  | { readonly kind: 'signed-in' }
  | { readonly kind: 'mfa'; readonly challenge: MfaChallenge };

export type GoogleOutcome =
  | SignInOutcome
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'linked' }
  | { readonly kind: 'terms'; readonly pendingSignupId: string; readonly termsVersion: string };

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly user: SessionUser | null;
  readonly isAdmin: boolean;
  readonly biometricLock: boolean;
  unlock(): Promise<boolean>;
  signIn(email: string, password: string): Promise<SignInOutcome>;
  verifyMfa(
    challenge: MfaChallenge,
    answer: { code: string } | { recoveryCode: string },
  ): Promise<void>;
  signUp(input: {
    email: string;
    password: string;
    displayName?: string;
    termsVersion: string;
  }): Promise<'signed-in' | 'created'>;
  signInWithGoogle(config: AppConfig, linking?: boolean): Promise<GoogleOutcome>;
  acceptGoogleTerms(pendingSignupId: string, termsVersion: string): Promise<SignInOutcome>;
  /** Store a session a server response re-issued (password change, 2FA toggle). */
  adoptSession(session: IssuedSession | undefined): Promise<void>;
  refreshUser(): Promise<void>;
  signOut(options?: { everywhere?: boolean }): Promise<void>;
  setBiometricLock(on: boolean): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [lock, setLock] = useState(false);
  const stored = useRef<StoredSession | null>(null);

  const endLocally = useCallback(async () => {
    stored.current = null;
    setAuthToken(null);
    await clearSession();
    queryClient.clear();
    setUser(null);
    setStatus('signed-out');
  }, []);

  const activate = useCallback(
    async (session: StoredSession) => {
      stored.current = session;
      setAuthToken(session.token);
      const me = await api.session();
      if (me === null) {
        await endLocally();
        return;
      }
      setUser(me);
      setStatus('signed-in');
    },
    [endLocally],
  );

  const store = useCallback(
    async (issued: IssuedSession) => activate(await saveSession(issued)),
    [activate],
  );

  const rotateIfDue = useCallback(async () => {
    const current = stored.current;
    if (current === null || !shouldRotate(current, new Date())) return;
    try {
      const fresh = await api.rotateSession();
      stored.current = await saveSession(fresh);
      setAuthToken(fresh.token);
    } catch {
      // Offline or transient: try again next time. A 401 is handled globally.
    }
  }, []);

  // A 401 / disabled account anywhere ends the session for good.
  useEffect(() => {
    onSessionEnded(() => {
      void endLocally();
    });
    return () => onSessionEnded(null);
  }, [endLocally]);

  const resume = useCallback(async () => {
    const session = await loadSession();
    if (session === null || isExpired(session, new Date())) {
      if (session !== null) await clearSession();
      setStatus('signed-out');
      return;
    }
    try {
      await activate(session);
      await rotateIfDue();
    } catch {
      // Could not reach the server: keep the token and let screens show the
      // offline state; the next successful request confirms the session.
      stored.current = session;
      setAuthToken(session.token);
      setStatus('signed-in');
    }
  }, [activate, rotateIfDue]);

  // Launch: biometric gate (if enabled) before the token is read into memory.
  useEffect(() => {
    void (async () => {
      const locked = await biometricLockEnabled();
      setLock(locked);
      if (locked && (await loadSession()) !== null) {
        setStatus('locked');
        return;
      }
      await resume();
    })();
  }, [resume]);

  // Rotate weekly while the app is used; check whenever it comes to the front.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void rotateIfDue();
    });
    return () => sub.remove();
  }, [rotateIfDue]);

  const handleGoogle = useCallback(
    async (response: Awaited<ReturnType<typeof api.googleNative>>): Promise<GoogleOutcome> => {
      switch (response.status) {
        case 'signed_in':
          await store(response.session);
          return { kind: 'signed-in' };
        case 'mfa_required':
          return {
            kind: 'mfa',
            challenge: {
              challengeId: response.challengeId,
              binding: response.binding,
              startedAt: Date.now(),
            },
          };
        case 'linked':
          return { kind: 'linked' };
        case 'terms_required':
          return {
            kind: 'terms',
            pendingSignupId: response.pendingSignupId,
            termsVersion: response.termsVersion,
          };
      }
    },
    [store],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAdmin: user?.role === 'admin',
      biometricLock: lock,

      async unlock() {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock EquityWise',
          cancelLabel: 'Cancel',
        });
        if (!result.success) return false;
        await resume();
        return true;
      },

      async signIn(email, password) {
        const response = await api.signIn({ email, password, device: deviceInfo() });
        if ('status' in response) {
          return {
            kind: 'mfa',
            challenge: {
              challengeId: response.challengeId,
              binding: response.binding,
              startedAt: Date.now(),
            },
          };
        }
        await store(response.session);
        return { kind: 'signed-in' };
      },

      async verifyMfa(challenge, answer) {
        const { session } = await api.verifyMfa({
          challengeId: challenge.challengeId,
          binding: challenge.binding,
          device: deviceInfo(),
          ...answer,
        });
        await store(session);
      },

      async signUp(input) {
        const response = await api.signUp({
          email: input.email,
          password: input.password,
          ...(input.displayName ? { displayName: input.displayName } : {}),
          acceptTerms: true,
          termsVersion: input.termsVersion,
          device: deviceInfo(),
        });
        if (response.session !== undefined) {
          await store(response.session);
          return 'signed-in';
        }
        return 'created';
      },

      async signInWithGoogle(config, linking = false) {
        const clientId = config.auth.googleWebClientId;
        if (!config.auth.googleSignIn || clientId === null) {
          throw new Error('Google sign-in is not available right now.');
        }
        const { nonceId, nonce } = await api.googleNonce();
        const picked = await pickGoogleAccount({ webClientId: clientId, nonce });
        if (picked === null) return { kind: 'cancelled' };
        const response = await api.googleNative(
          { idToken: picked.idToken, nonceId, device: deviceInfo() },
          linking,
        );
        return handleGoogle(response);
      },

      async acceptGoogleTerms(pendingSignupId, termsVersion) {
        const response = await api.googleNative({
          pendingSignupId,
          acceptTerms: true,
          termsVersion,
          device: deviceInfo(),
        });
        const outcome = await handleGoogle(response);
        if (outcome.kind === 'signed-in' || outcome.kind === 'mfa') return outcome;
        throw new Error('Could not finish creating your account. Please try again.');
      },

      async adoptSession(session) {
        if (session !== undefined) await store(session);
      },

      async refreshUser() {
        const me = await api.session();
        if (me === null) await endLocally();
        else setUser(me);
      },

      async signOut(options) {
        try {
          await api.signOut(options?.everywhere === true);
        } catch {
          // Even offline, the phone forgets the token; the server row expires.
        }
        await endLocally();
      },

      async setBiometricLock(on) {
        if (on) {
          const enrolled =
            (await LocalAuthentication.hasHardwareAsync()) &&
            (await LocalAuthentication.isEnrolledAsync());
          if (!enrolled)
            throw new Error('Set up a fingerprint or face unlock on this phone first.');
          const ok = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Confirm to turn on app lock',
          });
          if (!ok.success) return;
        }
        await setBiometricLock(on);
        setLock(on);
      },
    }),
    [status, user, lock, resume, store, endLocally, handleGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
