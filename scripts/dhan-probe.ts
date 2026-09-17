/**
 * Phase 0 probe for Dhan (docs/planning/dhan-provider-plan.md §8).
 *
 * Proves, from a developer machine and with no adapter code in the tree, that
 * the Dhan account is configured well enough to build on:
 *
 *   1. mints a 24 h access token from client id + PIN + TOTP
 *      (the DOCUMENTED endpoint — the thing Fyers does not have)
 *   2. reads the profile: is the Data API subscription active, until when
 *   3. resolves RELIANCE to a securityId from the instrument master
 *   4. pulls 30 days of daily bars and 5 days of 1-minute bars
 *   5. pulls a batch of snapshot quotes
 *   6. optionally, waits while you log into the Dhan app and re-checks the
 *      token — the single-session question the plan marks (verify)
 *
 * Everything printed is converted the way the future adapter will convert it:
 * rupee floats → integer paise, epoch seconds → IST wall-clock. Nothing is
 * written anywhere; this script has no side effects beyond spending a few
 * rate-limited calls.
 *
 * Usage:  pnpm dhan:probe
 *
 * The TOTP helper is borrowed from `@equitywise/fyers` because it is the one
 * RFC 6238 implementation in the repo; a real Dhan package would move it to
 * `@equitywise/shared` rather than import a sibling provider.
 */

import { createInterface } from 'node:readline/promises';
import { generateTotp } from '@equitywise/fyers';
import { formatPaise, toIstIsoString } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';

const ENV_PATH = new URL('../.env', import.meta.url).pathname;
loadEnv({ path: ENV_PATH });

const AUTH_BASE = 'https://auth.dhan.co/app';
const API_BASE = 'https://api.dhan.co/v2';
const SCRIP_MASTER = 'https://images.dhan.co/api-data/api-scrip-master.csv';
/** Data APIs are 5/s and Quote APIs 1/s; one call a second is safe for both. */
const PACE_MS = 1_100;
/** RELIANCE on NSE_EQ, per Dhan's own examples; overridden by the master lookup. */
const FALLBACK_SECURITY_ID = '2885';

function env(name: string): string {
  return process.env[name] ?? '';
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '—';
}

/** The adapter's rule: a rupee float becomes integer paise here and nowhere else. */
function toPaise(rupees: unknown): number | null {
  return typeof rupees === 'number' && Number.isFinite(rupees) ? Math.round(rupees * 100) : null;
}

function ist(epochSeconds: unknown): string {
  return typeof epochSeconds === 'number' ? toIstIsoString(new Date(epochSeconds * 1_000)) : '—';
}

interface Session {
  readonly clientId: string;
  readonly accessToken: string;
}

async function call(
  session: Session,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'access-token': session.accessToken,
      'client-id': session.clientId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Non-JSON error bodies are printed as-is below.
  }
  if (!response.ok) {
    fail(`${method} ${path} → HTTP ${response.status}\n${JSON.stringify(parsed, null, 2)}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// 1. Token
// ---------------------------------------------------------------------------

async function mintToken(clientId: string): Promise<string> {
  const preset = env('DHAN_ACCESS_TOKEN');
  if (preset !== '') {
    console.log('1. Token: using DHAN_ACCESS_TOKEN from .env (minting skipped)');
    return preset;
  }

  const pin = env('DHAN_PIN');
  const totpSecret = env('DHAN_TOTP_SECRET');
  if (pin === '' || totpSecret === '') {
    fail('Set DHAN_PIN and DHAN_TOTP_SECRET (or DHAN_ACCESS_TOKEN) in .env — see .env.example');
  }

  const totp = generateTotp(totpSecret, Math.floor(Date.now() / 1_000));
  const url = new URL(`${AUTH_BASE}/generateAccessToken`);
  url.searchParams.set('dhanClientId', clientId);
  url.searchParams.set('pin', pin);
  url.searchParams.set('totp', totp);

  const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // fall through with the raw body
  }
  if (!response.ok || !isRecord(parsed) || typeof parsed.accessToken !== 'string') {
    fail(
      `generateAccessToken → HTTP ${response.status}\n${JSON.stringify(parsed, null, 2)}\n` +
        'Check: TOTP enabled on the account, DHAN_TOTP_SECRET is the base32 SETUP KEY (not a code), ' +
        'PIN correct, and the machine clock is accurate (TOTP is time-based).',
    );
  }
  console.log(`1. Token: minted via TOTP · expires ${str(parsed.expiryTime)} (Dhan-local time)`);
  return parsed.accessToken;
}

// ---------------------------------------------------------------------------
// 2. Profile — Data API subscription state
// ---------------------------------------------------------------------------

async function checkProfile(session: Session, label: string): Promise<boolean> {
  const profile = await call(session, 'GET', '/profile');
  if (!isRecord(profile)) fail(`profile: unexpected body ${JSON.stringify(profile)}`);
  const dataPlan = str(profile.dataPlan);
  const dataValidity = str(profile.dataValidity);
  console.log(
    `${label} client ${str(profile.dhanClientId)} · token valid till ${str(profile.tokenValidity)} · ` +
      `Data API: ${dataPlan} (till ${dataValidity}) · segments ${str(profile.activeSegment)}`,
  );
  const active = dataPlan.toLowerCase() === 'active';
  if (!active) {
    console.warn(
      '   ⚠ Data API is not active. Subscribe at web.dhan.co → DhanHQ Trading APIs → Data APIs ' +
        '(₹499 + GST / 30 days) or every data call below will be refused.',
    );
  }
  return active;
}

// ---------------------------------------------------------------------------
// 3. Instrument master — RELIANCE → securityId
// ---------------------------------------------------------------------------

async function resolveReliance(): Promise<string> {
  try {
    const response = await fetch(SCRIP_MASTER);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csv = await response.text();
    const lines = csv.split('\n');
    const header = (lines[0] ?? '').split(',').map((h) => h.trim().toUpperCase());
    const col = (needle: string): number => header.findIndex((h) => h.includes(needle));
    const exch = col('EXCH_ID');
    const seg = col('SEGMENT');
    const id = col('SECURITY_ID');
    const sym = col('TRADING_SYMBOL');
    const series = col('SERIES');
    if (id < 0 || sym < 0) throw new Error(`unrecognised header: ${header.join(',')}`);

    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      const isNse = exch < 0 || cells[exch]?.trim() === 'NSE';
      const isEquity = seg < 0 || cells[seg]?.trim() === 'E';
      const isEq = series < 0 || cells[series]?.trim() === 'EQ';
      if (isNse && isEquity && isEq && cells[sym]?.trim() === 'RELIANCE') {
        const found = cells[id]?.trim() ?? '';
        if (found !== '') {
          console.log(
            `3. Instrument master: RELIANCE → NSE_EQ securityId ${found} (${lines.length - 1} rows)`,
          );
          return found;
        }
      }
    }
    throw new Error('RELIANCE not found');
  } catch (error) {
    console.warn(
      `3. Instrument master lookup failed (${error instanceof Error ? error.message : String(error)}); ` +
        `using securityId ${FALLBACK_SECURITY_ID}`,
    );
    return FALLBACK_SECURITY_ID;
  }
}

// ---------------------------------------------------------------------------
// 4. Bars
// ---------------------------------------------------------------------------

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function describeBars(label: string, body: unknown): void {
  if (!isRecord(body) || !Array.isArray(body.timestamp) || !Array.isArray(body.close)) {
    fail(`${label}: unexpected shape ${JSON.stringify(body).slice(0, 300)}`);
  }
  const n = body.timestamp.length;
  const first = body.timestamp[0];
  const last = body.timestamp[n - 1];
  const lastClose = toPaise(body.close[n - 1]);
  console.log(
    `${label}: ${n} bars · ${ist(first)} → ${ist(last)} · last close ` +
      `${lastClose === null ? '—' : `${lastClose} paise = ${formatPaise(lastClose)}`}`,
  );
  if (n === 0) console.warn('   ⚠ zero bars — a holiday range, or the Data API is inactive');
}

async function pullBars(session: Session, securityId: string): Promise<void> {
  const now = new Date();
  const daily = await call(session, 'POST', '/charts/historical', {
    securityId,
    exchangeSegment: 'NSE_EQ',
    instrument: 'EQUITY',
    fromDate: isoDate(new Date(now.getTime() - 30 * 86_400_000)),
    toDate: isoDate(now),
  });
  describeBars('4a. Daily bars (30 d)', daily);

  await sleep(PACE_MS);
  const intraday = await call(session, 'POST', '/charts/intraday', {
    securityId,
    exchangeSegment: 'NSE_EQ',
    instrument: 'EQUITY',
    interval: '1',
    fromDate: isoDate(new Date(now.getTime() - 5 * 86_400_000)),
    toDate: isoDate(now),
  });
  describeBars('4b. 1-minute bars (5 d)', intraday);
}

// ---------------------------------------------------------------------------
// 5. Quotes
// ---------------------------------------------------------------------------

async function pullQuotes(session: Session, securityId: string): Promise<void> {
  // RELIANCE plus two ids from Dhan's own docs (TCS 11536, HDFC Bank 1333).
  const ids = [Number(securityId), 11536, 1333];
  const body = await call(session, 'POST', '/marketfeed/ohlc', { NSE_EQ: ids });
  if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.data.NSE_EQ)) {
    fail(`quotes: unexpected shape ${JSON.stringify(body).slice(0, 300)}`);
  }
  const bySecurity = body.data.NSE_EQ;
  const lines = Object.entries(bySecurity).map(([id, quote]) => {
    const ltp = isRecord(quote) ? toPaise(quote.last_price) : null;
    return `${id}=${ltp === null ? '—' : formatPaise(ltp)}`;
  });
  console.log(`5. Quotes (/marketfeed/ohlc, ${ids.length} ids in one call): ${lines.join(' · ')}`);
  if (lines.length < ids.length)
    console.warn('   ⚠ fewer quotes than ids asked — note which are missing');
}

// ---------------------------------------------------------------------------
// 6. Single-session check
// ---------------------------------------------------------------------------

async function singleSessionCheck(session: Session): Promise<void> {
  if (!process.stdin.isTTY) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    '\n6. Single-session check: log into the Dhan app or web.dhan.co NOW, then press Enter… ',
  );
  rl.close();
  try {
    await checkProfile(session, '   after login:');
    console.log('   ✓ token survived another login — Dhan is NOT single-session (unlike Fyers)');
  } catch {
    console.log('   ✗ token was rejected after the login — Dhan IS single-session; plan for it');
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const clientId = env('DHAN_CLIENT_ID');
  if (clientId === '') fail('Set DHAN_CLIENT_ID in .env — see .env.example');

  console.log('Dhan Phase 0 probe — nothing is written; a handful of rate-limited calls.\n');

  const session: Session = { clientId, accessToken: await mintToken(clientId) };
  await sleep(PACE_MS);
  const dataApiActive = await checkProfile(session, '2. Profile:');
  if (!dataApiActive) {
    console.log('\nStopping here: the remaining checks need the Data API subscription.');
    return;
  }

  const securityId = await resolveReliance();
  await sleep(PACE_MS);
  await pullBars(session, securityId);
  await sleep(PACE_MS);
  await pullQuotes(session, securityId);
  await singleSessionCheck(session);

  console.log(
    '\n✓ Phase 0 complete. Record the answers in docs/planning/dhan-provider-plan.md §10.',
  );
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
