import 'server-only';
import { IS_PROD } from './cookie-config';

/**
 * Transactional email for verification and password reset.
 *
 * With no `RESEND_API_KEY` configured (local dev, or before the Resend account is
 * set up) the message — including the link — is printed to the server log, so the
 * flows are fully usable locally without any email service. Once the key and a
 * verified sending domain exist, it delivers through Resend's REST API. No SDK
 * dependency: it is a single POST.
 *
 * Every email sends from one verified sender. Override it with `AUTH_EMAIL_FROM`;
 * the default is the `support@equitywise.io` address on the verified domain.
 */

/** Verified Resend sender. Overridable via `AUTH_EMAIL_FROM`. */
const DEFAULT_FROM = 'EquityWise Support <support@equitywise.io>';

interface Mail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

function baseUrl(): string {
  const configured = process.env.AUTH_BASE_URL;
  if (configured !== undefined && configured !== '') return configured;
  return IS_PROD ? 'https://equitywise.io' : 'http://localhost:3000';
}

/**
 * Best-effort delivery: a send failure is LOGGED, never thrown. These emails are
 * non-critical to the request — verification is optional, and a password-reset
 * response must stay identical (enumeration-safe) whether or not the mail went
 * out. Letting a Resend error bubble up would 500 the flow and, for reset, leak
 * that the account exists.
 */
async function deliver(mail: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    console.log(
      `\n──[ auth email (dev — no RESEND_API_KEY) ]──\n` +
        `to:      ${mail.to}\nsubject: ${mail.subject}\n\n${mail.text}\n────────────────────────────────────────\n`,
    );
    return;
  }
  const from = process.env.AUTH_EMAIL_FROM ?? DEFAULT_FROM;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[auth-email] Resend delivery failed (${res.status}) to ${mail.to}: ${detail}`);
    }
  } catch (error) {
    console.error(`[auth-email] Resend request errored for ${mail.to}:`, error);
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${baseUrl()}/verify?token=${encodeURIComponent(token)}`;
  await deliver({
    to,
    subject: 'Verify your EquityWise email',
    text: `Confirm your email address:\n\n${link}\n\nThis link expires in 30 minutes. If you didn't create an account, ignore this message.`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${baseUrl()}/reset?token=${encodeURIComponent(token)}`;
  await deliver({
    to,
    subject: 'Reset your EquityWise password',
    text: `Reset your password:\n\n${link}\n\nThis link expires in 30 minutes and can be used once. If you didn't request this, ignore this message — your password stays unchanged.`,
  });
}

/**
 * Sent to the NEW address when a signed-in user requests an email change. The
 * swap happens only after this link is opened, proving the new inbox is reachable.
 */
export async function sendEmailChangeVerification(to: string, token: string): Promise<void> {
  const link = `${baseUrl()}/account/verify-email?token=${encodeURIComponent(token)}`;
  await deliver({
    to,
    subject: 'Confirm your new EquityWise email',
    text: `Confirm this address as your new EquityWise email:\n\n${link}\n\nThis link expires in 30 minutes. If you didn't request this change, ignore this message — your account email stays unchanged.`,
  });
}

/** A security notice to the OLD address after the email is changed away from it. */
export async function sendEmailChangedNotice(oldEmail: string, newEmail: string): Promise<void> {
  await deliver({
    to: oldEmail,
    subject: 'Your EquityWise email was changed',
    text: `The email on your EquityWise account was changed to ${newEmail}.\n\nIf this was you, no action is needed. If it wasn't, reset your password immediately and contact support.`,
  });
}

/** A security notice after a successful password change (not a reset). */
export async function sendPasswordChangedNotice(to: string): Promise<void> {
  await deliver({
    to,
    subject: 'Your EquityWise password was changed',
    text: `Your EquityWise password was just changed, and every other session was signed out.\n\nIf this wasn't you, reset your password immediately and contact support.`,
  });
}
