import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultExpiry, exchangeAuthCode, FyersHttpClient, writeCachedToken } from '@signal/fyers';
import { NextResponse } from 'next/server';

/**
 * GET /callback — the Fyers OAuth redirect target.
 *
 * Living inside the web app rather than in a throwaway CLI server is what makes
 * the daily login painless: the dev server already owns port 3000, so Fyers can
 * always redirect here. (A standalone script has to fight the dev server for
 * the port, which is exactly how this 404'd the first time.)
 *
 * Single-user local tool, so persisting the token to .env here is appropriate.
 * It would not be on a shared deployment.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENV_PATH = join(process.cwd(), '..', '..', '.env');
const TOKEN_CACHE = join(process.cwd(), '..', '..', '.fyers-token.json');

function page(title: string, body: string, ok: boolean): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.6 -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:${ok ? '#f0fdf4' : '#fef2f2'};color:#0f172a}
.card{max-width:34rem;padding:2.5rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center}
h1{margin:0 0 .5rem;font-size:1.25rem}p{margin:.25rem 0;color:#475569}
a{display:inline-block;margin-top:1.25rem;padding:.5rem 1rem;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none}</style>
</head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function persist(appId: string, accessToken: string): Promise<void> {
  const expiresAt = defaultExpiry(new Date());
  await writeCachedToken(TOKEN_CACHE, { accessToken, expiresAt: expiresAt.toISOString(), appId });

  const contents = await readFile(ENV_PATH, 'utf8');
  const line = `FYERS_ACCESS_TOKEN="${accessToken}"`;
  const pattern = /^FYERS_ACCESS_TOKEN=.*$/m;
  const next = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}\n${line}\n`;
  await writeFile(ENV_PATH, next, { encoding: 'utf8', mode: 0o600 });

  // The route handlers read process.env on each request, so this takes effect
  // immediately without a dev-server restart.
  process.env.FYERS_ACCESS_TOKEN = accessToken;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const authCode = url.searchParams.get('auth_code');
  const message = url.searchParams.get('message');

  if (authCode === null || authCode === '') {
    return page(
      'Login failed',
      `<p>${message ?? 'Fyers did not return an auth_code.'}</p><a href="/login">Try again</a>`,
      false,
    );
  }

  const appId = process.env.FYERS_APP_ID;
  const secretKey = process.env.FYERS_SECRET_KEY;
  const redirectUri = process.env.FYERS_REDIRECT_URI;
  if (!appId || !secretKey || !redirectUri) {
    return page(
      'Not configured',
      '<p>FYERS_APP_ID, FYERS_SECRET_KEY or FYERS_REDIRECT_URI is missing from .env.</p>',
      false,
    );
  }

  try {
    const accessToken = await exchangeAuthCode(
      new FyersHttpClient(),
      { appId, secretKey, redirectUri },
      authCode,
    );
    await persist(appId, accessToken);
    return page(
      'Signed in to Fyers',
      '<p>Access token saved. It expires tomorrow morning.</p><a href="/nifty50">Open NIFTY 50</a>',
      true,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const remedy = (error as { remedy?: string }).remedy;
    return page(
      'Could not exchange the auth code',
      `<p>${detail}</p>${remedy ? `<p><small>${remedy}</small></p>` : ''}<a href="/login">Try again</a>`,
      false,
    );
  }
}
