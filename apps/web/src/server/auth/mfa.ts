import 'server-only';
import {
  acceptTotpStep,
  bumpSecurityVersion,
  consumeChallengeById,
  consumeRecoveryCode,
  deleteAllSessionsForUser,
  disableMfa,
  enableMfa,
  getActiveChallenge,
  getMfaRecord,
  getUserWithProfile,
  recordChallengeFailure,
  savePendingMfaEnrollment,
  writeAudit,
} from '@equitywise/db';
import { getDatabase } from '@/server/db';
import { clearMfaCookie, readMfaBindingHash } from './challenges';
import { isNativeClient, nativeClientLabel } from './client';
import { clientIp } from './request';
import { getSessionAuthContext } from './require-user';
import { type IssuedSession, startSession } from './session';
import { hashToken } from './session-token';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from './totp';

export async function verifyMfaChallenge(input: {
  request: Request;
  challengeId: string;
  code?: string;
  recoveryCode?: string;
  /** The native app's challenge binding (browsers use the cookie instead). */
  binding?: string;
  deviceName?: string | null;
}): Promise<{ redirectTo: string; issued: IssuedSession }> {
  const binding =
    isNativeClient(input.request.headers) && input.binding
      ? hashToken(input.binding)
      : await readMfaBindingHash();
  if (!binding) throw new MfaError('INVALID_CHALLENGE', 410, 'This verification attempt expired.');
  const db = getDatabase();
  const challenge = await getActiveChallenge(db, hashToken(input.challengeId), 'mfa', binding);
  if (!challenge?.userId)
    throw new MfaError('INVALID_CHALLENGE', 410, 'This verification attempt expired.');
  const user = await getUserWithProfile(db, challenge.userId);
  if (user?.status !== 'active' || user.securityVersion !== challenge.securityVersion) {
    throw new MfaError('INVALID_CHALLENGE', 410, 'This verification attempt expired.');
  }
  const mfa = await getMfaRecord(db, user.id);
  if (!mfa?.enabledAt)
    throw new MfaError('INVALID_CHALLENGE', 410, 'Two-factor authentication is not enabled.');

  let accepted = false;
  if (input.code) {
    const step = verifyTotp(decryptTotpSecret(mfa.secretEncrypted), input.code);
    accepted =
      step !== null &&
      (mfa.lastUsedStep === null || step > mfa.lastUsedStep) &&
      (await acceptTotpStep(db, user.id, step));
  } else if (input.recoveryCode) {
    accepted = await consumeRecoveryCode(db, user.id, hashRecoveryCode(input.recoveryCode));
  }
  if (!accepted) {
    await recordChallengeFailure(db, challenge.id);
    throw new MfaError('INVALID_CODE', 401, 'The verification code is invalid or already used.');
  }
  if (!(await consumeChallengeById(db, challenge.id))) {
    throw new MfaError('INVALID_CHALLENGE', 410, 'This verification attempt expired.');
  }
  const authenticationMethod =
    challenge.data.authenticationMethod === 'google' ? 'google' : 'password';
  const issued = await startSession(user.id, input.request, {
    securityVersion: user.securityVersion,
    authenticationMethod,
    authIdentityId: authenticationMethod === 'google' ? challenge.identityId : null,
    mfaVerifiedAt: new Date(),
    deviceName: input.deviceName ?? null,
  });
  await writeAudit(db, {
    event: 'mfa_success',
    userId: user.id,
    ipAddress: clientIp(input.request),
    detail: {
      method: input.recoveryCode ? 'recovery_code' : 'totp',
      client: nativeClientLabel(input.request.headers) ?? 'web',
    },
  });
  if (issued.bearer === null) await clearMfaCookie();
  return {
    redirectTo: typeof challenge.data.next === 'string' ? challenge.data.next : '/watchlists',
    issued,
  };
}

export async function beginMfaEnrollment(userId: number): Promise<{
  secret: string;
  otpauthUri: string;
  recoveryCodes: readonly string[];
}> {
  const db = getDatabase();
  const user = await getUserWithProfile(db, userId);
  if (!user) throw new MfaError('UNAUTHENTICATED', 401, 'Not signed in.');
  const current = await getMfaRecord(db, userId);
  if (current?.enabledAt)
    throw new MfaError('MFA_ALREADY_ENABLED', 409, 'Two-factor authentication is already enabled.');
  const secret = generateTotpSecret();
  const recoveryCodes = generateRecoveryCodes();
  await savePendingMfaEnrollment(
    db,
    userId,
    encryptTotpSecret(secret),
    recoveryCodes.map(hashRecoveryCode),
  );
  const label = encodeURIComponent(`EquityWise:${user.email}`);
  const issuer = encodeURIComponent('EquityWise');
  return {
    secret,
    otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    recoveryCodes,
  };
}

export async function confirmMfaEnrollment(
  userId: number,
  code: string,
  request: Request,
): Promise<IssuedSession> {
  const db = getDatabase();
  const mfa = await getMfaRecord(db, userId);
  if (!mfa || mfa.enabledAt) throw new MfaError('NO_ENROLLMENT', 409, 'Start enrollment again.');
  const step = verifyTotp(decryptTotpSecret(mfa.secretEncrypted), code);
  if (step === null || !(await enableMfa(db, userId, step))) {
    throw new MfaError('INVALID_CODE', 400, 'Enter a valid code from your authenticator app.');
  }
  const current = await getSessionAuthContext();
  const securityVersion = await bumpSecurityVersion(db, userId);
  await deleteAllSessionsForUser(db, userId);
  const issued = await startSession(userId, request, {
    securityVersion,
    authenticationMethod: current?.session.authenticationMethod ?? 'password',
    authIdentityId: current?.session.authIdentityId ?? null,
    mfaVerifiedAt: new Date(),
    deviceName: current?.session.deviceName ?? null,
  });
  await writeAudit(db, { event: 'mfa_enabled', userId, ipAddress: clientIp(request) });
  return issued;
}

export async function turnOffMfa(
  userId: number,
  code: string,
  request: Request,
): Promise<IssuedSession> {
  const db = getDatabase();
  const mfa = await getMfaRecord(db, userId);
  if (!mfa?.enabledAt)
    throw new MfaError('MFA_NOT_ENABLED', 409, 'Two-factor authentication is not enabled.');
  const step = verifyTotp(decryptTotpSecret(mfa.secretEncrypted), code);
  if (step === null || (mfa.lastUsedStep !== null && step <= mfa.lastUsedStep)) {
    throw new MfaError('INVALID_CODE', 400, 'Enter a fresh authenticator code.');
  }
  const current = await getSessionAuthContext();
  const securityVersion = await disableMfa(db, userId);
  if (securityVersion === null)
    throw new MfaError('MFA_NOT_ENABLED', 409, 'Two-factor authentication is not enabled.');
  await deleteAllSessionsForUser(db, userId);
  const issued = await startSession(userId, request, {
    securityVersion,
    authenticationMethod: current?.session.authenticationMethod ?? 'password',
    authIdentityId: current?.session.authIdentityId ?? null,
    deviceName: current?.session.deviceName ?? null,
  });
  await writeAudit(db, { event: 'mfa_disabled', userId, ipAddress: clientIp(request) });
  return issued;
}

export class MfaError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
