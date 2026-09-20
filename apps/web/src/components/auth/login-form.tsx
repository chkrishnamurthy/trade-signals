'use client';

import { EyeIcon, EyeOffIcon, LockKeyholeIcon } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { FormControl, FormField, FormLabel } from '@/components/forms/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_ROUTES } from '@/lib/api-routes';
import { AuthCard } from './auth-card';
import { MfaChallenge } from './mfa-challenge';
import { SocialLogin } from './social-login';

type SignInError = {
  error?: string;
  code?: string;
};

export function LoginForm({
  next,
  accountCreated = false,
  googleEnabled = false,
  initialError,
}: {
  next: string;
  accountCreated?: boolean;
  googleEnabled?: boolean;
  initialError?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    initialError ? mapOAuthError(initialError) : null,
  );
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(API_ROUTES.authSignIn, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          challengeId?: string;
        };
        if (data.status === 'mfa_required' && data.challengeId) {
          setMfaChallenge(data.challengeId);
          return;
        }
        window.location.href = next;
        return;
      }
      const data = (await res.json().catch(() => ({}))) as SignInError;
      setError(signInErrorMessage(res.status, data));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (mfaChallenge) {
    return (
      <AuthCard title="Two-factor verification" subtitle="Complete sign-in to continue.">
        <MfaChallenge challengeId={mfaChallenge} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Continue to your NSE watchlists and technical readings."
      footer={
        <span className="flex items-center justify-between gap-3">
          New here?
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create account
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {accountCreated && error === null ? (
          <Alert>
            <AlertDescription>
              Your account was created. Please sign in to continue.
            </AlertDescription>
          </Alert>
        ) : null}
        {error !== null ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <FormField>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              aria-invalid={error !== null ? true : undefined}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10"
            />
          </FormControl>
        </FormField>

        <FormField>
          <div className="flex items-center justify-between gap-3">
            <FormLabel>Password</FormLabel>
            <Link href="/reset" className="font-medium text-primary text-xs hover:underline">
              Reset password
            </Link>
          </div>
          <FormControl>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                aria-invalid={error !== null ? true : undefined}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-translate-y-1/2 absolute top-1/2 right-1 text-muted-foreground"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </div>
          </FormControl>
        </FormField>

        <Button type="submit" className="h-10 w-full" loading={busy}>
          Sign in
        </Button>

        <div className="flex gap-3 rounded-md border border-border bg-surface-sunken p-3 text-muted-foreground text-xs leading-5">
          <LockKeyholeIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium text-foreground">Private by default.</span> Your watchlists
            are account-scoped. EquityWise is for market analysis and does not place trades.
          </p>
        </div>
      </form>
      {googleEnabled ? <SocialLogin next={next} /> : null}
    </AuthCard>
  );
}

function mapOAuthError(code: string): string {
  if (code === 'ACCOUNT_DISABLED') return 'This account has been disabled.';
  if (code === 'SIGNUP_CLOSED') return 'Registration is currently closed.';
  if (code === 'access_denied') return 'Google sign-in was cancelled.';
  if (code === 'UNVERIFIED_EMAIL') return 'Google reports your email address is not verified.';
  return 'Google sign-in could not be completed. Please try again.';
}

function signInErrorMessage(status: number, data: SignInError): string {
  if (data.code === 'RATE_LIMIT' || status === 429) {
    return 'Too many attempts. Please try again in a few minutes or reset your password.';
  }
  if (data.code === 'ACCOUNT_DISABLED') {
    return data.error ?? 'This account is disabled.';
  }
  if (data.code === 'INVALID_BODY' || status === 400) {
    return 'Enter a valid email and password.';
  }
  if (data.code === 'BAD_ORIGIN') {
    return 'This sign-in request was blocked. Refresh the page and try again.';
  }
  return 'Email or password is incorrect. You can try again or reset your password.';
}
