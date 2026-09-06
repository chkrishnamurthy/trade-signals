'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { API_ROUTES } from '@/lib/api-routes';
import { AuthCard } from './auth-card';

type State = 'working' | 'done' | 'error';

/** Consumes the verification token on mount and reports the outcome. */
export function VerifyClient({ token }: { token: string | null }) {
  const [state, setState] = useState<State>(token === null ? 'error' : 'working');
  const [message, setMessage] = useState('This verification link is invalid.');

  useEffect(() => {
    if (token === null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API_ROUTES.authVerify, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          setState('done');
        } else {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setMessage(data.error ?? 'This verification link is invalid or has expired.');
          setState('error');
        }
      } catch {
        if (!cancelled) {
          setMessage('Network error — please try the link again.');
          setState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthCard
      title="Email verification"
      footer={
        <Link href="/watchlists" className="hover:text-foreground">
          Continue to EquityWise
        </Link>
      }
    >
      {state === 'working' ? (
        <p className="text-sm text-muted-foreground">Verifying your email…</p>
      ) : state === 'done' ? (
        <Alert>
          <AlertDescription>Your email is verified. Thank you.</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </AuthCard>
  );
}
