'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_ROUTES } from '@/lib/api-routes';
import { AuthCard } from './auth-card';

/** With a `token` it sets a new password; without one it emails a reset link. */
export function ResetForm({ token }: { token: string | null }) {
  if (token !== null) return <SetNewPassword token={token} />;
  return <RequestLink />;
}

function RequestLink() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await fetch(API_ROUTES.authResetRequest, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* answer is intentionally the same regardless */
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="We'll email you a link to set a new password."
      footer={
        <Link href="/login" className="hover:text-foreground">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert>
          <AlertDescription>
            If an account exists for that email, a reset link is on its way.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

function SetNewPassword({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(API_ROUTES.authResetConfirm, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Could not reset your password.');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Set a new password"
      footer={
        <Link href="/login" className="hover:text-foreground">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <Alert>
          <AlertDescription>
            Your password has been reset.{' '}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">At least 12 characters.</p>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : 'Reset password'}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
