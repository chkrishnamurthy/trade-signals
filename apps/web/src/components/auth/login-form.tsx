'use client';

import {
  ActivityIcon,
  EyeIcon,
  EyeOffIcon,
  LockKeyholeIcon,
  type LucideIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { FormControl, FormField, FormLabel } from '@/components/forms/form-field';
import { Brand } from '@/components/layout/brand';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_ROUTES } from '@/lib/api-routes';

type SignInError = {
  error?: string;
  code?: string;
};

export function LoginForm({
  next,
  accountCreated = false,
}: {
  next: string;
  accountCreated?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-7xl grid-rows-[auto_1fr_auto]">
      <header className="flex items-center justify-between gap-4">
        <Brand />
        <span className="hidden rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-subtle sm:inline-flex">
          Private watchlists
        </span>
      </header>

      <div className="grid items-center gap-8 py-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,424px)] lg:gap-16 lg:py-10">
        <section className="hidden min-w-0 lg:block" aria-label="EquityWise workspace preview">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            NSE market analysis workspace
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-tight text-foreground xl:text-5xl xl:leading-[1.05]">
            Your watchlists, technical readings, and market setups in one calm place.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Sign in to continue tracking the stocks you follow, review daily readings, and spot
            setups worth attention.
          </p>

          <WorkspacePreview />

          <div className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-3">
            <TrustCue
              icon={ShieldCheckIcon}
              title="Private watchlists"
              description="Each account sees only its own lists and saved views."
            />
            <TrustCue
              icon={LockKeyholeIcon}
              title="First-party login"
              description="Sessions and password hashes stay on EquityWise servers."
            />
            <TrustCue
              icon={ActivityIcon}
              title="No broker actions"
              description="Analysis and screening only, never order placement."
            />
          </div>
        </section>

        <section
          className="mx-auto w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-elevated"
          aria-label="Sign in form"
        >
          <div className="lg:hidden">
            <Brand className="text-sm" />
          </div>
          <h2 className="mt-6 font-display text-2xl font-bold tracking-tight text-foreground lg:mt-0">
            Sign in
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Continue to your NSE watchlists and technical readings.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                <Link href="/reset" className="text-xs font-medium text-primary hover:underline">
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
                    className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
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

            <div className="flex gap-3 rounded-md border border-border bg-surface-sunken p-3 text-xs leading-5 text-muted-foreground">
              <LockKeyholeIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p>
                <span className="font-medium text-foreground">Private by default.</span> Your
                watchlists are account-scoped. EquityWise is for market analysis and does not place
                trades.
              </p>
            </div>
          </form>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
            <span>New here?</span>
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create account
            </Link>
          </div>
        </section>
      </div>

      <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
        Decision support only. EquityWise tracks and screens equities; it does not place, manage, or
        represent trades.
      </p>
    </main>
  );
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

function WorkspacePreview() {
  return (
    <div className="mt-7 max-w-3xl overflow-hidden rounded-lg border border-border bg-surface shadow-elevated">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-foreground">My watchlist</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Live prices and daily technical readings
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-market-closed" aria-hidden />
          NSE closed
        </span>
      </div>

      <div className="divide-y divide-border">
        <PreviewRow header symbol="Symbol" price="Price" change="1D" setup="Setup" />
        <PreviewRow
          symbol="RELIANCE"
          sector="Energy"
          price="INR 2,840.50"
          change="+1.8%"
          setup="Bullish setup"
          tone="bullish"
        />
        <PreviewRow
          symbol="TCS"
          sector="IT services"
          price="INR 4,126.20"
          change="-0.4%"
          setup="Neutral"
          tone="neutral"
        />
        <PreviewRow
          symbol="HDFCBANK"
          sector="Financials"
          price="INR 1,722.90"
          change="+0.9%"
          setup="Volume watch"
          tone="warning"
        />
        <PreviewRow
          symbol="INFY"
          sector="Technology"
          price="INR 1,582.75"
          change="+1.1%"
          setup="Trend change"
          tone="bullish"
        />
      </div>
    </div>
  );
}

function PreviewRow({
  header = false,
  symbol,
  sector,
  price,
  change,
  setup,
  tone = 'neutral',
}: {
  header?: boolean;
  symbol: string;
  sector?: string | undefined;
  price: string;
  change: string;
  setup: string;
  tone?: 'bullish' | 'neutral' | 'warning';
}) {
  if (header) {
    return (
      <div className="grid min-h-9 grid-cols-[minmax(110px,1.2fr)_0.9fr_0.6fr_minmax(112px,1fr)] items-center gap-3 px-4 text-2xs font-semibold tracking-wide text-subtle-foreground uppercase">
        <span>{symbol}</span>
        <span>{price}</span>
        <span>{change}</span>
        <span>{setup}</span>
      </div>
    );
  }

  const changeClass = change.startsWith('-') ? 'text-bearish-strong' : 'text-bullish-strong';
  const setupClass =
    tone === 'bullish'
      ? 'border-bullish-line bg-bullish-soft text-bullish-strong'
      : tone === 'warning'
        ? 'border-warning-line bg-warning-soft text-warning-foreground'
        : 'border-neutral-line bg-neutral-soft text-neutral-strong';

  return (
    <div className="grid min-h-11 grid-cols-[minmax(110px,1.2fr)_0.9fr_0.6fr_minmax(112px,1fr)] items-center gap-3 px-4">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{symbol}</span>
        {sector !== undefined ? (
          <span className="block truncate text-xs text-muted-foreground">{sector}</span>
        ) : null}
      </span>
      <span className="figure text-sm text-foreground">{price}</span>
      <span className={`figure text-sm font-medium ${changeClass}`}>{change}</span>
      <span
        className={`inline-flex justify-self-start rounded-full border px-2 py-1 text-xs font-medium ${setupClass}`}
      >
        {setup}
      </span>
    </div>
  );
}

function TrustCue({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/80 p-4 shadow-subtle">
      <Icon className="size-4 text-primary" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}
