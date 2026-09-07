'use client';

import { ShieldIcon } from 'lucide-react';
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

/**
 * Two-factor (TOTP) — intentionally a preview placeholder in this pass.
 *
 * Enrolment and login enforcement need an encrypted seed store (`auth_mfa`),
 * recovery codes, and changes to the sign-in flow — see the profile-page plan.
 * Shipping a toggle that didn't actually gate sign-in would be a false sense of
 * security, so the control is shown as coming soon rather than half-wired.
 */
export function TwoFactor() {
  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle className="flex items-center gap-2">
            <ShieldIcon className="size-4 text-muted-foreground" />
            Two-factor authentication
          </CardTitle>
          <CardDescription>Add a time-based one-time code at sign-in.</CardDescription>
        </CardHeading>
        <Badge variant="neutral" size="sm">
          Coming soon
        </Badge>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <p className="text-muted-foreground text-sm">
          Authenticator-app 2FA is on the roadmap and not yet available.
        </p>
        <Button size="sm" variant="outline" disabled>
          Enable
        </Button>
      </CardContent>
    </Card>
  );
}
