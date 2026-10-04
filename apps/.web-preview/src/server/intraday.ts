import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ORB_CONFIG, orbRules } from '@equitywise/core';
import { latestIntradayScan, listIntradayExclusions, listIntradaySignals } from '@equitywise/db';
import {
  type IntradayToday,
  intradayRulesSchema,
  intradayTodaySchema,
  istDateKey,
  istMinutesOfDay,
  isWeekend,
  sessionOpen,
} from '@equitywise/shared';
import { NextResponse } from 'next/server';
import { parse } from 'yaml';
import { z } from 'zod';
import { unauthenticated } from './auth/http';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { getMarketStatus } from './market-status';
import { describeDataSources } from './provider';

/**
 * Read side of the intraday strategy page. This layer never evaluates a
 * candle, never sizes a share and never calls a provider for prices: it reads
 * what the worker persisted and asks the exchange whether it is open.
 */
const settingsSchema = z.object({ enabled: z.boolean() }).passthrough();
/** Repo root, from apps/web at runtime — the same convention as indices.ts. */
const CONFIG_PATH = join(process.cwd(), '..', '..', 'config', 'intraday-orb.yaml');
async function settings() {
  return settingsSchema.parse(parse(await readFile(CONFIG_PATH, 'utf8')));
}
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** Admin-only while the strategy is under evaluation: 401 when not signed in, 403 otherwise. */
async function authenticated(run: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const user = await getSessionUser();
    if (!user) return unauthenticated();
    if (user.role !== 'admin')
      return NextResponse.json(
        { error: 'Admin access required.', code: 'FORBIDDEN' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    return NextResponse.json(await run(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    // The cause goes to the server log only; never expose database errors,
    // query text, file paths or connection details to clients.
    if (!invalid)
      console.error('[intraday] snapshot failed', {
        errorName: error instanceof Error ? error.name : 'Error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    return NextResponse.json(
      {
        error: invalid
          ? (error.issues[0]?.message ?? 'Invalid request.')
          : 'Intraday data is temporarily unavailable.',
        code: invalid ? 'INVALID_INPUT' : 'INTRADAY_UNAVAILABLE',
      },
      {
        status: invalid ? 400 : 503,
        headers: { 'Cache-Control': 'no-store', ...(invalid ? {} : { 'Retry-After': '30' }) },
      },
    );
  }
}

function phaseAt(now: number, marketOpen: boolean | null): IntradayToday['phase'] {
  if (isWeekend(new Date(now)) || marketOpen === false) return 'CLOSED';
  const minute = istMinutesOfDay(new Date(now));
  if (minute < 555) return 'PRE_OPEN';
  if (minute < ORB_CONFIG.firstSignalCloseMinute) return 'OPENING_RANGE';
  if (minute <= ORB_CONFIG.lastSignalCloseMinute) return 'SESSION';
  if (minute < 930) return 'AFTER_ENTRIES';
  return 'CLOSED';
}

export async function intradaySnapshot(tradingDate: string, now: number): Promise<IntradayToday> {
  const db = getDatabase();
  const [config, status, signals, scanner, exclusions] = await Promise.all([
    settings(),
    getMarketStatus(),
    listIntradaySignals(db, tradingDate),
    latestIntradayScan(db),
    listIntradayExclusions(db, tradingDate),
  ]);
  const today = tradingDate === istDateKey(new Date(now));
  const marketOpen = status?.isOpen ?? null;
  const lastQuoteAt = signals.reduce<number | null>(
    (latest, s) =>
      s.quoteAt !== null && (latest === null || s.quoteAt > latest) ? s.quoteAt : latest,
    null,
  );
  const sources = describeDataSources();
  const quoteSource = sources.routes.find((r) => r.route === 'quotes')?.provider ?? sources.active;
  const mode: IntradayToday['source']['mode'] = !today
    ? 'CLOSED'
    : marketOpen === false
      ? 'CLOSED'
      : !config.enabled || scanner === null
        ? 'UNAVAILABLE'
        : lastQuoteAt !== null && now - lastQuoteAt <= ORB_CONFIG.coverageGapMs
          ? 'LIVE'
          : now < sessionOpen(new Date(now)).getTime()
            ? 'CLOSED'
            : 'STALE';
  const rules = intradayRulesSchema.parse(orbRules());
  return intradayTodaySchema.parse({
    serverNow: now,
    sessionDate: tradingDate,
    phase: today ? phaseAt(now, marketOpen) : 'CLOSED',
    source: { name: quoteSource, mode, lastQuoteAt },
    scanner: today ? scanner : null,
    rules,
    signals,
    exclusions,
  });
}

export function readIntradayToday() {
  return authenticated(() => {
    const now = Date.now();
    return intradaySnapshot(istDateKey(new Date(now)), now);
  });
}
export function readIntradayDay(date: string) {
  return authenticated(() => intradaySnapshot(dateSchema.parse(date), Date.now()));
}
export function readIntradayRules() {
  return authenticated(async () => intradayRulesSchema.parse(orbRules()));
}
