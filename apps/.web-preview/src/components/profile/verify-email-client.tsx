'use client';

import { CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { API_ROUTES } from '@/lib/api-routes';
import { sendJson } from './request';

type State =
  | { status: 'pending' }
  | { status: 'ok'; email: string }
  | { status: 'error'; message: string };

/** Consumes the email-change token once on mount and reports the outcome. */
export function VerifyEmailClient({ token }: { token: string | null }) {
  const [state, setState] = useState<State>({ status: 'pending' });

  useEffect(() => {
    if (token === null) {
      setState({ status: 'error', message: 'This link is missing its token.' });
      return;
    }
    let cancelled = false;
    void sendJson<{ email?: string }>(API_ROUTES.accountEmailConfirm, 'POST', { token }).then(
      (res) => {
        if (cancelled) return;
        if (res.ok) {
          setState({ status: 'ok', email: res.data.email ?? '' });
        } else {
          setState({ status: 'error', message: res.error });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        {state.status === 'pending' ? (
          <p className="text-muted-foreground text-sm">Confirming your new email…</p>
        ) : state.status === 'ok' ? (
          <>
            <CheckCircle2Icon className="size-8 text-bullish-strong" />
            <div className="flex flex-col gap-1">
              <h1 className="font-semibold text-foreground">Email updated</h1>
              <p className="text-muted-foreground text-sm">
                {state.email !== '' ? (
                  <>
                    Your account email is now <span className="text-foreground">{state.email}</span>
                    .
                  </>
                ) : (
                  'Your account email has been updated.'
                )}
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/profile">Back to profile</Link>
            </Button>
          </>
        ) : (
          <>
            <XCircleIcon className="size-8 text-destructive" />
            <div className="flex flex-col gap-1">
              <h1 className="font-semibold text-foreground">Couldn't confirm</h1>
              <p className="text-muted-foreground text-sm">{state.message}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/profile">Back to profile</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
