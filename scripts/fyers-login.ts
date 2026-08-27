/**
 * One-command Fyers login.
 *
 * Fyers access tokens expire daily and, since the refresh-token flow was
 * discontinued on 1 April 2026, every token starts with an interactive 2FA
 * login. This script does the whole OAuth dance locally:
 *
 *   1. builds the authorisation URL and opens it in your browser
 *   2. serves the registered redirect URI (http://localhost:3000/callback)
 *      just long enough to catch the auth_code
 *   3. exchanges it for an access_token
 *   4. writes the token to the cache and into .env
 *
 * Usage:  pnpm fyers:login
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import {
  buildAuthCodeUrl,
  defaultExpiry,
  exchangeAuthCode,
  type FyersCredentials,
  FyersHttpClient,
  writeCachedToken,
} from '@equitywise/fyers';
import { toIstIsoString } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';

const ENV_PATH = new URL('../.env', import.meta.url).pathname;
const TOKEN_CACHE = new URL('../.fyers-token.json', import.meta.url).pathname;

loadEnv({ path: ENV_PATH });

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(`Missing ${name} in .env`);
    process.exit(2);
  }
  return value;
}

/** Rewrites a single KEY="value" line in .env, leaving everything else alone. */
async function updateEnvValue(key: string, value: string): Promise<void> {
  const contents = await readFile(ENV_PATH, 'utf8');
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}\n${line}\n`;
  await writeFile(ENV_PATH, next, { encoding: 'utf8', mode: 0o600 });
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // Non-fatal: the URL is printed anyway.
  }
}

const PAGE = (title: string, body: string, ok: boolean): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
 body{font:16px/1.6 -apple-system,system-ui,sans-serif;display:grid;place-items:center;
      min-height:100vh;margin:0;background:${ok ? '#f0fdf4' : '#fef2f2'};color:#0f172a}
 .card{max-width:34rem;padding:2.5rem;background:#fff;border-radius:12px;
       box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center}
 h1{margin:0 0 .5rem;font-size:1.25rem}
 p{margin:.25rem 0;color:#475569}
</style></head>
<body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;

/**
 * Persists the freshly minted token where every process actually reads it.
 *
 * `.env` and the file cache only reach a process that is started afterwards on
 * this host. Since the credential table landed, `apps/web` and the worker read
 * `provider_credentials` first, and a login that skipped it left them running
 * on yesterday's expired token — every history call failing with "the
 * market-data credential has expired", no candles ingested, and an intraday
 * page that looks like a quiet market rather than a dead feed.
 *
 * Reached through the worker's own composition root rather than a second
 * provider id of our own, so there is exactly one place that decides what this
 * provider is called.
 */
async function storeCredential(
  accessToken: string,
  appId: string,
  expiresAt: Date,
): Promise<boolean> {
  try {
    const { saveProviderCredential } = await import('@equitywise/db');
    const { createContext } = await import('../apps/worker/src/context.js');
    const context = createContext();
    try {
      await saveProviderCredential(context.db, {
        providerId: context.providerId,
        appId,
        accessToken,
        expiresAt,
      });
    } finally {
      await context.close();
    }
    return true;
  } catch (error) {
    // Not fatal: the token is already in .env, so a local run still works.
    console.warn(
      `\nWarning: could not write the credential to the database — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    console.warn('The web app will fall back to FYERS_ACCESS_TOKEN from .env.');
    return false;
  }
}

async function main(): Promise<void> {
  const credentials: FyersCredentials = {
    appId: required('FYERS_APP_ID'),
    secretKey: required('FYERS_SECRET_KEY'),
    redirectUri: required('FYERS_REDIRECT_URI'),
  };

  const redirect = new URL(credentials.redirectUri);
  const port = Number(redirect.port === '' ? 80 : redirect.port);
  const state = randomBytes(8).toString('hex');
  const authUrl = buildAuthCodeUrl(credentials, state);

  console.log('\nFyers login');
  console.log(`  app        ${credentials.appId}`);
  console.log(`  redirect   ${credentials.redirectUri}`);
  console.log(`\nOpening your browser. If it does not open, paste this:\n\n  ${authUrl}\n`);
  console.log(`Listening on ${redirect.origin}${redirect.pathname} ...`);

  const authCode = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirect.origin);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end('not found');
        return;
      }

      const code = url.searchParams.get('auth_code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('message') ?? url.searchParams.get('error');

      if (code === null || code === '') {
        res
          .writeHead(400, { 'Content-Type': 'text/html' })
          .end(PAGE('Login failed', `<p>${error ?? 'No auth_code in the redirect.'}</p>`, false));
        server.close();
        reject(new Error(error ?? 'No auth_code in the redirect'));
        return;
      }

      // The state round-trip is what stops a stray redirect being accepted.
      if (returnedState !== state) {
        res
          .writeHead(400, { 'Content-Type': 'text/html' })
          .end(
            PAGE(
              'State mismatch',
              '<p>The state parameter did not match. Re-run the login.</p>',
              false,
            ),
          );
        server.close();
        reject(new Error(`state mismatch: expected ${state}, got ${String(returnedState)}`));
        return;
      }

      res
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          PAGE(
            'Authorised',
            '<p>Token captured. You can close this tab and return to the terminal.</p>',
            true,
          ),
        );
      server.close();
      resolve(code);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} is already in use — probably \`next dev\`. ` +
              `Stop it and re-run, or run: lsof -ti:${port} | xargs kill`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.listen(port);
    setTimeout(() => {
      server.close();
      reject(new Error('Timed out after 5 minutes waiting for the redirect'));
    }, 300_000).unref();

    openBrowser(authUrl);
  });

  console.log('\nGot auth_code. Exchanging for an access token...');

  const http = new FyersHttpClient();
  const accessToken = await exchangeAuthCode(http, credentials, authCode);

  const issuedAt = new Date();
  const expiresAt = defaultExpiry(issuedAt);

  await writeCachedToken(TOKEN_CACHE, {
    accessToken,
    expiresAt: expiresAt.toISOString(),
    appId: credentials.appId,
  });
  await updateEnvValue('FYERS_ACCESS_TOKEN', accessToken);
  const stored = await storeCredential(accessToken, credentials.appId, expiresAt);

  console.log('\nAccess token saved.');
  console.log(`  .env                 FYERS_ACCESS_TOKEN`);
  console.log(`  cache                .fyers-token.json (mode 0600)`);
  console.log(
    `  credential store     ${stored ? 'provider_credentials (database)' : 'SKIPPED — see the warning above'}`,
  );
  console.log(`  valid until          ${toIstIsoString(expiresAt)}`);
  console.log('\nNext:  pnpm verify:intraday --dry\n');
  if (stored) {
    console.log('Restart the worker so it picks the new token up immediately:');
    console.log('  pnpm --filter @equitywise/worker dev\n');
  }
}

main().catch((error: unknown) => {
  console.error(`\nLogin failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
