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
import { MIN_PASSWORD_LENGTH, validatePassword } from '@/server/auth/password-policy';
import { sendJson } from './request';

/** Change password while signed in. Requires the current password; signs out other devices. */
export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const strength = next === '' ? null : validatePassword(next);
  const mismatch = confirm !== '' && confirm !== next;
  const canSubmit = current !== '' && next !== '' && strength?.ok === true && !mismatch && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const res = await sendJson(API_ROUTES.accountPassword, 'POST', {
      currentPassword: current,
      newPassword: next,
    });
    setBusy(false);
    if (res.ok) {
      setCurrent('');
      setNext('');
      setConfirm('');
      toast({
        title: 'Password changed',
        description: 'Other devices have been signed out.',
        variant: 'success',
      });
    } else {
      toast({ title: "Couldn't change password", description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs out every other device.</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={next}
              aria-invalid={strength !== null && !strength.ok}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {strength !== null && !strength.ok
                ? strength.reason
                : `At least ${MIN_PASSWORD_LENGTH} characters.`}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirm}
              aria-invalid={mismatch}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch ? <p className="text-destructive text-xs">Passwords don't match.</p> : null}
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
