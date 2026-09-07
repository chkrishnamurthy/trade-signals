'use client';

import { ChangeEmail } from './change-email';
import { ChangePassword } from './change-password';
import { DangerZone } from './danger-zone';
import { EmailVerification } from './email-verification';
import { SessionsList } from './sessions-list';
import { TwoFactor } from './two-factor';

/** The Account & Security tab: identity, credentials, sessions, and account removal. */
export function SecurityTab({ email, emailVerified }: { email: string; emailVerified: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <EmailVerification verified={emailVerified} />
      <ChangeEmail currentEmail={email} />
      <ChangePassword />
      <TwoFactor />
      <SessionsList />
      <DangerZone />
    </div>
  );
}
