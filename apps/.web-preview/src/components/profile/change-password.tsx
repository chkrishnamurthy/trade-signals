'use client';

import { useState } from 'react';
import {
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from '@/components/forms/form-field';
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
import { useToast } from '@/components/ui/toast';
import { API_ROUTES } from '@/lib/api-routes';
import { PASSWORD_RULE_HINT, validatePassword } from '@/server/auth/password-policy';
import { sendJson } from './request';

/** Change password while signed in. Requires the current password; signs out other devices. */
export function ChangePassword({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const strength = next === '' ? null : validatePassword(next);
  const mismatch = confirm !== '' && confirm !== next;
  const canSubmit =
    (!hasPassword || current !== '') && next !== '' && strength?.ok === true && !mismatch && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const res = await sendJson(API_ROUTES.accountPassword, 'POST', {
      ...(hasPassword ? { currentPassword: current } : {}),
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
          <CardTitle>{hasPassword ? 'Password' : 'Add a password'}</CardTitle>
          <CardDescription>
            {hasPassword
              ? 'Changing it signs out every other device.'
              : 'Use password sign-in as a backup to Google. This requires a recent Google sign-in.'}
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        {hasPassword ? (
          <FormField>
            <FormLabel>Current password</FormLabel>
            <FormControl>
              <Input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </FormControl>
          </FormField>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField>
            <FormLabel>New password</FormLabel>
            <FormControl>
              {/* The strength hint stays a muted description (not an error), so the
                  border is driven by an explicit aria-invalid rather than the
                  field's invalid state. */}
              <Input
                type="password"
                autoComplete="new-password"
                value={next}
                aria-invalid={strength !== null && !strength.ok}
                onChange={(e) => setNext(e.target.value)}
              />
            </FormControl>
            <FormDescription>
              {strength !== null && !strength.ok ? strength.reason : PASSWORD_RULE_HINT}
            </FormDescription>
          </FormField>
          <FormField invalid={mismatch}>
            <FormLabel>Confirm new password</FormLabel>
            <FormControl>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </FormControl>
            <FormMessage>{mismatch ? "Passwords don't match." : undefined}</FormMessage>
          </FormField>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Add password'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
