import { router } from 'expo-router';
import { useState } from 'react';
import { errorMessage } from './api';
import { useAppConfig } from './app-config';
import { useAuth } from './auth';
import { setPendingMfa } from './pending-mfa';

/**
 * The Google flow shared by the sign-in and sign-up screens: pick an account,
 * then either we're in, a 2FA code is needed, or (a new account) the terms
 * popup must be accepted first.
 */
export function useGoogleSignIn() {
  const auth = useAuth();
  const config = useAppConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<{ pendingSignupId: string; termsVersion: string } | null>(
    null,
  );

  const available = config.data?.auth.googleSignIn === true;

  async function start() {
    if (!config.data) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await auth.signInWithGoogle(config.data);
      if (outcome.kind === 'mfa') {
        setPendingMfa(outcome.challenge);
        router.push('/two-factor');
      } else if (outcome.kind === 'terms') {
        setTerms({ pendingSignupId: outcome.pendingSignupId, termsVersion: outcome.termsVersion });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function acceptTerms() {
    if (terms === null) return;
    setBusy(true);
    try {
      const outcome = await auth.acceptGoogleTerms(terms.pendingSignupId, terms.termsVersion);
      setTerms(null);
      if (outcome.kind === 'mfa') {
        setPendingMfa(outcome.challenge);
        router.push('/two-factor');
      }
    } catch (e) {
      setTerms(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return { available, busy, error, terms, start, acceptTerms, cancelTerms: () => setTerms(null) };
}
