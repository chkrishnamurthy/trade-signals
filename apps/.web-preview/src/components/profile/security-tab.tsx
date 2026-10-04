'use client';

import { ChangeEmail } from './change-email';
import { ChangePassword } from './change-password';
import { ConnectedMethods } from './connected-methods';
import { DangerZone } from './danger-zone';
import { EmailVerification } from './email-verification';
import { SessionsList } from './sessions-list';
import { TwoFactor } from './two-factor';

/** The Account & Security tab: identity, credentials, sessions, and account removal. */
export function SecurityTab({
  email,
  emailVerified,
  mfaEnabled,
  googleEnabled,
  hasPassword,
  identities,
}: {
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  googleEnabled: boolean;
  hasPassword: boolean;
  identities: readonly {
    id: number;
    provider: 'google';
    email: string | null;
    connectedAt: string;
  }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <EmailVerification verified={emailVerified} />
      </div>
      <ChangeEmail currentEmail={email} />
      <ChangePassword hasPassword={hasPassword} />
      <ConnectedMethods
        initialIdentities={identities}
        googleEnabled={googleEnabled}
        hasPassword={hasPassword}
      />
      <TwoFactor initiallyEnabled={mfaEnabled} />
      <SessionsList />
      <div className="md:col-span-2">
        <DangerZone />
      </div>
    </div>
  );
}
