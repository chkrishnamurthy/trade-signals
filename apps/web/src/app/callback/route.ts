import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_ROUTES } from '@/lib/api-routes';
import { getAdminUser } from '@/server/auth/require-user';
import { toMarketError } from '@/server/errors';
import { completeProviderAuthorisation } from '@/server/provider';
import { OAUTH_STATE_COOKIE } from '../api/fyers/connect/route';

/**
 * GET /callback — the provider's OAuth redirect target.
 *
 * Living inside the web app rather than a throwaway CLI server is what makes
 * the daily re-authorisation painless: the dev server already owns port 3000,
 * so the provider can always redirect here.
 *
 * The exchange and the save are `completeProviderAuthorisation`'s; this route
 * only checks the caller, the one-shot `state`, and renders the outcome.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

/**
 * The OAuth callback page.
 *
 * A standalone HTML document returned by a route handler, so it cannot import
 * the application stylesheet. The design tokens are therefore declared inline —
 * the same values as `globals.css`, kept deliberately minimal: canvas, surface,
 * border, text and one accent per outcome. If the palette changes there, these
 * five lines change too.
 */
function page(title: string, body: string, ok: boolean): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{
  color-scheme:light dark;
  --background:oklch(0.978 0.004 253);--surface:oklch(1 0 0);
  --foreground:oklch(0.21 0.021 258);--muted-foreground:oklch(0.502 0.018 257);
  --border:oklch(0.916 0.008 253);--primary:oklch(0.412 0.098 255);
  --primary-foreground:oklch(0.985 0.003 253);
  --accent:${ok ? 'oklch(0.552 0.126 157)' : 'oklch(0.552 0.186 22)'};
  --radius:0.5rem;
}
@media (prefers-color-scheme:dark){:root{
  --background:oklch(0.163 0.012 259);--surface:oklch(0.201 0.013 259);
  --foreground:oklch(0.951 0.005 253);--muted-foreground:oklch(0.688 0.014 257);
  --border:oklch(0.298 0.013 259);--primary:oklch(0.732 0.104 250);
  --primary-foreground:oklch(0.172 0.021 259);
  --accent:${ok ? 'oklch(0.712 0.138 158)' : 'oklch(0.668 0.172 22)'};
}}
body{font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  display:grid;place-items:center;min-height:100dvh;margin:0;padding:1.5rem;
  background:var(--background);color:var(--foreground);-webkit-font-smoothing:antialiased}
.card{max-width:34rem;padding:2rem;background:var(--surface);
  border:1px solid var(--border);border-top:3px solid var(--accent);
  border-radius:calc(var(--radius) + 4px);text-align:center}
h1{margin:0 0 .5rem;font-size:1.125rem;font-weight:600;letter-spacing:-0.01em}
p{margin:.25rem 0;font-size:.875rem;color:var(--muted-foreground)}
code{font-family:ui-monospace,"SF Mono",monospace;font-size:.8125rem}
a{display:inline-block;margin-top:1.25rem;padding:.5rem 1rem;
  background:var(--primary);color:var(--primary-foreground);
  border-radius:var(--radius);font-size:.875rem;font-weight:500;text-decoration:none}
</style>
</head><body><div class="card"><h1>${escapeHtml(title)}</h1>${body}</div></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  // Admin only: this saves the shared market-data credential. The state cookie
  // alone is not enough — /api/fyers/connect hands one to anyone who asks.
  if ((await getAdminUser()) === null) {
    return page(
      'Not allowed',
      '<p>Only an administrator can connect the market-data source.</p><a href="/login">Sign in</a>',
      false,
    );
  }

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
        `<a href="${API_ROUTES.fyersConnect}">Start again</a>`,
      false,
    );
  }

  if (authCode === null || authCode === '') {
    return page(
      'Authorisation failed',
      `<p>${escapeHtml(message ?? 'No auth_code was returned.')}</p><a href="${API_ROUTES.fyersConnect}">Try again</a>`,
      false,
    );
  }

  try {
    await completeProviderAuthorisation(authCode);
    return page(
      'Data source connected',
      '<p>Credential saved. It expires tomorrow morning.</p><a href="/watchlists">Open your watchlists</a>',
      true,
    );
  } catch (error) {
    const failure = toMarketError(error);
    return page(
      'Could not complete authorisation',
      `<p>${escapeHtml(failure.message)}</p>${
        failure.remedy === undefined ? '' : `<p><small>${escapeHtml(failure.remedy)}</small></p>`
      }<a href="${API_ROUTES.fyersConnect}">Try again</a>`,
      false,
    );
  }
}
