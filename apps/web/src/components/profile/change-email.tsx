'use client';

import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { API_ROUTES } from '@/lib/api-routes';
import { sendJson } from './request';

/** Request an email change. The address only changes after the new inbox confirms the link. */
export function ChangeEmail({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const canSubmit =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) &&
    newEmail.toLowerCase() !== currentEmail.toLowerCase() &&
    password !== '' &&
    !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const res = await sendJson(API_ROUTES.accountEmail, 'POST', {
      newEmail,
      currentPassword: password,
    });
    setBusy(false);
    if (res.ok) {
      setSent(true);
      setPassword('');
      toast({
        title: 'Confirmation sent',
        description: `Open the link we sent to ${newEmail} to finish.`,
        variant: 'success',
      });
    } else {
      toast({
        title: "Couldn't start email change",
        description: res.error,
        variant: 'destructive',
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            Signed in as <span className="text-foreground">{currentEmail}</span>
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        {sent ? (
          <p className="text-muted-foreground text-sm">
            We sent a confirmation link to <span className="text-foreground">{newEmail}</span>. Your
            email changes only after you open it. Didn't get it? Check spam, or resubmit below.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newEmail">New email</Label>
            <Input
              id="newEmail"
              type="email"
              autoComplete="email"
              value={newEmail}
              placeholder="you@example.com"
              onChange={(e) => {
                setNewEmail(e.target.value);
                setSent(false);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emailPassword">Current password</Label>
            <Input
              id="emailPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'Sending…' : 'Send confirmation'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
