/**
 * Plain-text email from the worker, through Resend's REST API.
 *
 * Mirrors the web app's auth mailer (`apps/web/src/server/auth/email.ts`): one
 * verified sender, no SDK, and a send failure is reported to the caller as a
 * boolean rather than thrown — a mail outage must not stop a job that has
 * already recorded its result. With no `RESEND_API_KEY` (local dev) nothing is
 * sent and the caller is told so.
 */

const DEFAULT_FROM = 'EquityWise Support <support@equitywise.io>';

export interface Mail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export type MailSender = (mail: Mail) => Promise<boolean>;

export const sendMail: MailSender = async (mail) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey === undefined || apiKey === '') return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? DEFAULT_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
};
