'use client';

import { ChangeEmail } from './change-email';
import { ChangePassword } from './change-password';
import { DangerZone } from './danger-zone';
import { EmailVerification } from './email-verification';
import { SessionsList } from './sessions-list';
import { TwoFactor } from './two-factor';

/** The Account & Security tab: identity, credentials, sessions, and account removal. */
export function SecurityTab({ email, emailVerified }: { email: string; emailVerified: boolean }) {
  // Two columns on md+ so the security tab fills the page width like every
  // other screen. Banners and the wide list/danger panels span the full row;
  // the paired credential cards sit side by side.
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <EmailVerification verified={emailVerified} />
      </div>
      <ChangeEmail currentEmail={email} />
      <ChangePassword />
      <TwoFactor />
      <SessionsList />
      <div className="md:col-span-2">
        <DangerZone />
      </div>
    </div>
  );
}
