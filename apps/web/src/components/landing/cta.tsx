'use client';

import Link from 'next/link';
import { useSignupOpen } from '@/lib/use-session';
import { cn } from '@/lib/utils';

/** The one filled button style on the landing page — `primary-strong` keeps white text at AA. */
export const PRIMARY_CTA =
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary-strong px-6 font-semibold text-base text-primary-foreground shadow-subtle transition-colors hover:bg-primary-strong/90 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';
export const SECONDARY_CTA =
  'inline-flex h-12 items-center justify-center rounded-xl border border-border-strong bg-surface px-6 font-semibold text-base text-foreground transition-colors hover:bg-accent outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * "Create free account" — or, while self-service sign-up is closed
 * (`AUTH_ALLOW_SIGNUP=false`, where `/signup` answers 404), "Sign in", so no
 * button on the page leads to a dead end.
 */
export function SignupCta({ className }: { className?: string | undefined }) {
  const signupOpen = useSignupOpen();
  return signupOpen ? (
    <Link href="/signup" className={cn(PRIMARY_CTA, className)}>
      Create free account
    </Link>
  ) : (
    <Link href="/login" className={cn(PRIMARY_CTA, className)}>
      Sign in
    </Link>
  );
}

/** "Already have an account? Sign in" — only beside a sign-up button. */
export function AlreadyHaveAccount() {
  const signupOpen = useSignupOpen();
  if (!signupOpen) return null;
  return (
    <p className="m-0 text-muted-foreground text-sm">
      Already have an account?{' '}
      <Link
        href="/login"
        className="rounded-sm font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Sign in
      </Link>
    </p>
  );
}
