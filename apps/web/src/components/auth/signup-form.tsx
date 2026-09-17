'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { FormControl, FormDescription, FormField, FormLabel } from '@/components/forms/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { API_ROUTES } from '@/lib/api-routes';
import { PASSWORD_RULE_HINT } from '@/server/auth/password-policy';
import { AuthCard } from './auth-card';

export function SignupForm() {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accept) {
      setError('Please accept the Terms & Privacy Policy.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(API_ROUTES.authSignUp, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName.trim() === '' ? undefined : displayName.trim(),
          acceptTerms: true,
        }),
      });
      if (res.ok) {
        // `signedIn: false` means the account was created but the session cookie
        // couldn't be set — send them to sign in rather than into a guarded page.
        const data = (await res.json().catch(() => ({}))) as { signedIn?: boolean };
        window.location.href = data.signedIn === false ? '/login?created=1' : '/watchlists';
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Could not create your account.');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Track, screen and analyse NSE equities."
      footer={
        <span>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error !== null ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField>
          <FormLabel>Name (optional)</FormLabel>
          <FormControl>
            <Input
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </FormControl>
        </FormField>
        <FormField>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormControl>
        </FormField>
        <FormField>
          <FormLabel>Password</FormLabel>
          <FormControl>
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormControl>
          <FormDescription>{PASSWORD_RULE_HINT}</FormDescription>
        </FormField>
        <label
          htmlFor="accept-terms"
          className="flex items-start gap-2 text-sm text-muted-foreground"
        >
          <Checkbox
            id="accept-terms"
            checked={accept}
            onCheckedChange={(v) => setAccept(v === true)}
            className="mt-0.5"
          />
          <span>
            I agree to the{' '}
            <Link href="/terms" className="text-foreground hover:underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-foreground hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
