import { timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type AuthorizedCredential,
  CREDENTIAL_ENV_VAR,
  completeAuthorization,
  persistCredential,
  readAuthConfig,
} from '@signal/providers-fyers';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { toMarketError } from '@/server/errors';
import { OAUTH_STATE_COOKIE } from '../login/route';

/**
 * GET /callback — the provider's OAuth redirect target.
 *
 * Living inside the web app rather than a throwaway CLI server is what makes
 * the daily re-authorisation painless: the dev server already owns port 3000,
 * so the provider can always redirect here.
 *
 * Single-user local tool, so persisting the credential to .env here is
 * appropriate. It would not be on a shared deployment.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENV_PATH = join(process.cwd(), '..', '..', '.env');
const TOKEN_CACHE = join(process.cwd(), '..', '..', '.fyers-token.json');

/** Constant-time compare, so a mismatch cannot be found byte by byte. */
function statesMatch(received: string | undefined, expected: string | undefined): boolean {
  if (received === undefined || expected === undefined) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title: string, body: string, ok: boolean): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font:16px/1.6 -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:${ok ? '#f0fdf4' : '#fef2f2'};color:#0f172a}
.card{max-width:34rem;padding:2.5rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center}
h1{margin:0 0 .5rem;font-size:1.25rem}p{margin:.25rem 0;color:#475569}
a{display:inline-block;margin-top:1.25rem;padding:.5rem 1rem;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none}</style>
</head><body><div class="card"><h1>${escapeHtml(title)}</h1>${body}</div></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Writes the credential to the token cache and to .env.
 *
 * Also sets it on the live process, because route handlers read env on every
 * request — so re-authorisation takes effect without a restart.
 */
async function persist(credential: AuthorizedCredential): Promise<void> {
  await persistCredential(TOKEN_CACHE, credential);

  const contents = await readFile(ENV_PATH, 'utf8');
  const line = `${CREDENTIAL_ENV_VAR}="${credential.accessToken}"`;
  const pattern = new RegExp(`^${CREDENTIAL_ENV_VAR}=.*$`, 'm');
  const next = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}\n${line}\n`;
  await writeFile(ENV_PATH, next, { encoding: 'utf8', mode: 0o600 });

  process.env[CREDENTIAL_ENV_VAR] = credential.accessToken;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const authCode = url.searchParams.get('auth_code');
  const message = url.searchParams.get('message');
  const state = url.searchParams.get('state');

  const jar = await cookies();
  const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
  // One-shot: consume it whatever the outcome, so a leaked state is not reusable.
  jar.delete(OAUTH_STATE_COOKIE);

  if (!statesMatch(state ?? undefined, expectedState)) {
    return page(
      'Authorisation rejected',
      '<p>The <code>state</code> did not match the one this browser started with, so the response was discarded.</p>' +
        '<p><small>Start the sign-in from this app rather than following a link.</small></p>' +
        '<a href="/login">Start again</a>',
      false,
    );
  }

  if (authCode === null || authCode === '') {
    return page(
      'Authorisation failed',
      `<p>${escapeHtml(message ?? 'No auth_code was returned.')}</p><a href="/login">Try again</a>`,
      false,
    );
  }

  try {
    const config = readAuthConfig(process.env);
    const credential = await completeAuthorization(config, authCode);
    await persist(credential);
    return page(
      'Data source connected',
      '<p>Credential saved. It expires tomorrow morning.</p><a href="/dashboard">Open the dashboard</a>',
      true,
    );
  } catch (error) {
    const failure = toMarketError(error);
    return page(
      'Could not complete authorisation',
      `<p>${escapeHtml(failure.message)}</p>${
        failure.remedy === undefined ? '' : `<p><small>${escapeHtml(failure.remedy)}</small></p>`
      }<a href="/login">Try again</a>`,
      false,
    );
  }
}
