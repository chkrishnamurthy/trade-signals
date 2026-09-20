'use client';

import { ShieldIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

type Enrollment = { secret: string; otpauthUri: string; recoveryCodes: readonly string[] };

export function TwoFactor({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    const response = await fetch(API_ROUTES.accountMfa, { method: 'POST' });
    const result = (await response.json().catch(() => ({}))) as Enrollment & { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? 'Could not start two-factor setup.');
      return;
    }
    setEnrollment(result);
  }

  async function submit(method: 'PUT' | 'DELETE') {
    setBusy(true);
    setError(null);
    const response = await fetch(API_ROUTES.accountMfa, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? 'Could not update two-factor authentication.');
      return;
    }
    setEnabled(method === 'PUT');
    setEnrollment(null);
    setCode('');
  }

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle className="flex items-center gap-2">
            <ShieldIcon className="size-4 text-muted-foreground" />
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            Require an authenticator code after password or Google sign-in.
          </CardDescription>
        </CardHeading>
        <Badge variant={enabled ? 'bullish' : 'neutral'} size="sm">
          {enabled ? 'Enabled' : 'Off'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!enabled && !enrollment ? (
          <Button size="sm" variant="outline" onClick={start} disabled={busy}>
            {busy ? 'Starting…' : 'Enable'}
          </Button>
        ) : null}
        {enrollment ? (
          <div className="space-y-3 text-sm">
            <p>Add this setup key to your authenticator app:</p>
            <code className="block break-all rounded bg-surface-sunken p-2">
              {enrollment.secret}
            </code>
            <p className="text-muted-foreground text-xs">
              Save these recovery codes now. Each works once.
            </p>
            <code className="grid grid-cols-2 gap-1 rounded bg-surface-sunken p-2">
              {enrollment.recoveryCodes.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </code>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
            />
            <Button size="sm" onClick={() => submit('PUT')} disabled={busy || code.length !== 6}>
              Confirm and enable
            </Button>
          </div>
        ) : null}
        {enabled ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Enter a fresh authenticator code to turn off two-factor authentication.
            </p>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
            />
            <Button
              size="sm"
              variant="destructive"
              onClick={() => submit('DELETE')}
              disabled={busy || code.length !== 6}
            >
              Disable
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
