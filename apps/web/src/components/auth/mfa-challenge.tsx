'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_ROUTES } from '@/lib/api-routes';

export function MfaChallenge({ challengeId }: { challengeId: string }) {
  const [value, setValue] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.authMfaVerify, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, [recovery ? 'recoveryCode' : 'code']: value }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        redirectTo?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Verification failed.');
      window.location.assign(result.redirectTo ?? '/watchlists');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {recovery
          ? 'Enter one unused recovery code.'
          : 'Enter the six-digit code from your authenticator app.'}
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        placeholder={recovery ? 'XXXXX-XXXXX' : '000000'}
        maxLength={recovery ? 32 : 6}
        autoFocus
      />
      <Button className="w-full" onClick={verify} disabled={busy || value.length < 6}>
        {busy ? 'Verifying…' : 'Verify'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setRecovery((current) => !current);
          setValue('');
          setError(null);
        }}
      >
        {recovery ? 'Use authenticator code' : 'Use a recovery code'}
      </Button>
    </div>
  );
}
