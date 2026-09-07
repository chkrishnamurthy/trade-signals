'use client';

import { CheckCircle2Icon, MailWarningIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { API_ROUTES } from '@/lib/api-routes';
import { sendJson } from './request';

/** Shows verification status; offers a resend when the email isn't verified yet. */
export function EmailVerification({ verified }: { verified: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  if (verified) {
    return (
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Email verified</AlertTitle>
        <AlertDescription>Your email address is confirmed.</AlertDescription>
      </Alert>
    );
  }

  async function resend() {
    setBusy(true);
    const res = await sendJson(API_ROUTES.accountVerify, 'POST');
    setBusy(false);
    if (res.ok) {
      setDone(true);
      toast({ title: 'Verification email sent', variant: 'success' });
    } else {
      toast({ title: "Couldn't send email", description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Alert variant="warning">
      <MailWarningIcon />
      <AlertTitle>Email not verified</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>Verify your email so you don't lose access if you forget your password.</span>
        <Button variant="outline" size="sm" disabled={busy || done} onClick={() => void resend()}>
          {done ? 'Email sent' : busy ? 'Sending…' : 'Resend verification email'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
