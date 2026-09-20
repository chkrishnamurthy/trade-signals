'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_ROUTES } from '@/lib/api-routes';

type Identity = {
  id: number;
  provider: 'google';
  email: string | null;
  connectedAt: string;
};

export function ConnectedMethods({
  initialIdentities,
  googleEnabled,
  hasPassword,
}: {
  initialIdentities: readonly Identity[];
  googleEnabled: boolean;
  hasPassword: boolean;
}) {
  const [identities, setIdentities] = useState<readonly Identity[]>(initialIdentities);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function connectGoogle() {
    setBusy(true);
    window.location.assign(API_ROUTES.authGoogle('/profile'));
  }

  async function disconnect(id: number) {
    if (hasPassword && !password) {
      return setError('Enter your current password to disconnect Google.');
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.accountIdentity(id), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: password }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Could not disconnect Google.');
      }
      setIdentities((current) => current.filter((identity) => identity.id !== id));
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not disconnect Google.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Sign-in methods</CardTitle>
          <CardDescription>
            Connect Google without replacing your EquityWise account or password.
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {identities.map((identity) => (
          <div
            key={identity.id}
            className="flex items-center justify-between gap-3 rounded border border-border p-3 text-sm"
          >
            <div>
              <p className="font-medium">Google</p>
              <p className="text-muted-foreground text-xs">{identity.email}</p>
            </div>
            {hasPassword ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => disconnect(identity.id)}
                disabled={busy}
              >
                Disconnect
              </Button>
            ) : null}
          </div>
        ))}

        {hasPassword && identities.length > 0 ? (
          <div className="space-y-1 pt-1">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Current password (required to disconnect)"
              className="text-xs"
            />
          </div>
        ) : null}

        {googleEnabled && identities.length === 0 ? (
          <Button size="sm" variant="outline" onClick={connectGoogle} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Google'}
          </Button>
        ) : null}

        {!hasPassword ? (
          <p className="text-muted-foreground text-xs">
            Google is currently your only sign-in method. Add a password in the section above before disconnecting it.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
