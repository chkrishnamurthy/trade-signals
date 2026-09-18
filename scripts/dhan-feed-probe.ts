/**
 * Phase 0 of docs/planning/paper-trading-plan.md: measure the Dhan live feed
 * before the paper-trading engine is allowed to trust it as the live tier.
 *
 * Connects one socket for the NIFTY 50 universe (plus the index) using the
 * worker-minted token, then for `--minutes` records, per symbol and overall:
 *
 *   - tick counts and the gaps between consecutive ticks (p50 / p95 / p99 / max)
 *   - the skew between the exchange's last-trade time and our receipt clock
 *   - silences while connected (> 10 s with no packet at all)
 *   - reconnects, disconnect packets and their reason codes
 *   - every packet code seen, so "is there a market-status packet in v2?" gets
 *     an answer from the wire rather than the docs
 *
 * Reads only. Writes nothing to the database. No orders exist in this codebase.
 *
 *   pnpm dhan:feed-probe                      # 30 minutes, ticker mode
 *   pnpm dhan:feed-probe --minutes 10 --mode quote --out probe.md
 *
 * Run it during a live session; outside one the report will (correctly) show
 * zero ticks and the previous-close packets only.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDatabase, getProviderCredential } from '@equitywise/db';
import {
  DhanFeedTransport,
  DhanHttpClient,
  type DhanSession,
  type FeedPacket,
  InstrumentIndex,
  listInstruments,
  securityKey,
  streamTicks,
} from '@equitywise/dhan';
import { toIstIsoString } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';
import { loadIndexConstituents } from '../apps/worker/src/universe.js';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const { values } = parseArgs({
  options: {
    minutes: { type: 'string', default: '30' },
    mode: { type: 'string', default: 'ticker' },
    out: { type: 'string' },
    universe: { type: 'string', default: 'nifty50' },
  },
});
const minutes = Number(values.minutes);
const mode = values.mode === 'quote' ? 'quote' : 'ticker';
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('--minutes must be positive');

/** Silence threshold the live-quote hub already uses to declare a socket dead. */
const SILENCE_MS = 10_000;
/** The engine's coverage rule: a gap wider than this makes an outcome unavailable. */
const COVERAGE_GAP_MS = 15_000;

interface SymbolStats {
  ticks: number;
  lastAt: number | null;
  gaps: number[];
  skews: number[];
  nullLtt: number;
  futureLtt: number;
}
const percentile = (xs: number[], p: number): number | null => {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? null;
};
const fmt = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);
const ist = (ms: number) => toIstIsoString(new Date(ms)).slice(11, 23);

async function main() {
  const handle = createDatabase({});
  const lines: string[] = [];
  const log = (line: string) => {
    console.log(line);
    lines.push(line);
  };
  try {
    const credential = await getProviderCredential(handle.db, 'dhan');
    if (!credential)
      throw new Error(
        'No Dhan credential in provider_credentials; let the worker mint one (01:35 IST) or run pnpm dhan:probe.',
      );
    if (credential.expiresAt.getTime() < Date.now())
      throw new Error(`Dhan credential expired at ${credential.expiresAt.toISOString()}`);
    const session: DhanSession = {
      clientId: credential.appId,
      accessToken: credential.accessToken,
    };

    const http = new DhanHttpClient({});
    const { instruments, futures } = await listInstruments(http);
    const index = new InstrumentIndex(instruments, futures);
    const universe = await loadIndexConstituents(values.universe ?? 'nifty50');
    const keys = new Map<string, string>(); // securityKey → our symbol
    for (const item of universe) {
      const ref = index.refFor(item.symbol, 'equity');
      if (ref) keys.set(securityKey(ref), item.symbol);
      else log(`! ${item.symbol}: not in the Dhan scrip master`);
    }
    const nifty = index.refFor('NIFTY50', 'index');
    if (nifty) keys.set(securityKey(nifty), 'NIFTY50');
    log(`# Dhan feed probe — ${toIstIsoString(new Date())}`);
    log(
      `mode ${mode} · ${keys.size} instruments · ${minutes} min · client ${credential.appId.slice(0, 3)}…`,
    );

    const stats = new Map<string, SymbolStats>();
    for (const symbol of keys.values())
      stats.set(symbol, { ticks: 0, lastAt: null, gaps: [], skews: [], nullLtt: 0, futureLtt: 0 });
    const packetCodes = new Map<string, number>();
    const events: string[] = [];
    let lastPacketAt = Date.now();
    let silences = 0;
    let longestSilence = 0;
    let reconnects = 0;
    const startedAt = Date.now();

    const stream = streamTicks(
      [...keys.keys()],
      (tick) => {
        const now = Date.now();
        const symbol = keys.get(securityKey(tick.ref));
        const s = symbol ? stats.get(symbol) : undefined;
        if (!s) return;
        s.ticks += 1;
        if (s.lastAt !== null) s.gaps.push(now - s.lastAt);
        s.lastAt = now;
        if (tick.lastTradedAt === null) s.nullLtt += 1;
        else {
          const skew = now - tick.lastTradedAt.getTime();
          s.skews.push(skew);
          if (skew < -1_000) s.futureLtt += 1;
        }
      },
      {
        createTransport: () => {
          const transport = new DhanFeedTransport(session, { mode });
          transport.on('message', (payload) => {
            const now = Date.now();
            const silence = now - lastPacketAt;
            if (silence > SILENCE_MS) {
              silences += 1;
              longestSilence = Math.max(longestSilence, silence);
              events.push(`${ist(now)} silence ${fmt(silence)} ended`);
            }
            lastPacketAt = now;
            const packet = payload as FeedPacket | null;
            const code =
              packet?.kind === 'other'
                ? `other:${packet.header.code}`
                : (packet?.kind ?? 'undecoded');
            packetCodes.set(code, (packetCodes.get(code) ?? 0) + 1);
            if (packet?.kind === 'disconnect')
              events.push(`${ist(now)} disconnect packet ${packet.code} ${packet.reason}`);
          });
          return transport;
        },
        heartbeatTimeoutMs: 30_000,
        onStateChange: (state) => {
          if (state === 'reconnecting') reconnects += 1;
          events.push(`${ist(Date.now())} state → ${state}`);
        },
        onError: (error) =>
          events.push(
            `${ist(Date.now())} error ${error instanceof Error ? error.message : String(error)}`,
          ),
      },
    );

    await new Promise<void>((resolve) => setTimeout(resolve, minutes * 60_000));
    stream.close();
    const elapsed = Date.now() - startedAt;

    const all = [...stats.values()];
    const allGaps = all.flatMap((s) => s.gaps);
    const allSkews = all.flatMap((s) => s.skews);
    const totalTicks = all.reduce((n, s) => n + s.ticks, 0);
    log('');
    log('## Overall');
    log('| Metric | Value |');
    log('| --- | --- |');
    log(`| Duration | ${fmt(elapsed)} |`);
    log(`| Ticks | ${totalTicks} (${(totalTicks / (elapsed / 1000)).toFixed(1)}/s) |`);
    log(
      `| Symbols with zero ticks | ${all.filter((s) => s.ticks === 0).length} of ${all.length} |`,
    );
    log(
      `| Tick gap p50 / p95 / p99 / max | ${fmt(percentile(allGaps, 50))} / ${fmt(percentile(allGaps, 95))} / ${fmt(percentile(allGaps, 99))} / ${fmt(allGaps.length ? Math.max(...allGaps) : null)} |`,
    );
    log(
      `| Gaps over the ${COVERAGE_GAP_MS / 1000}s coverage rule | ${allGaps.filter((g) => g > COVERAGE_GAP_MS).length} of ${allGaps.length} |`,
    );
    log(
      `| LTT skew (receipt − exchange) p50 / p99 | ${fmt(percentile(allSkews, 50))} / ${fmt(percentile(allSkews, 99))} |`,
    );
    log(
      `| Ticks with LTT ahead of our clock (> 1 s) | ${all.reduce((n, s) => n + s.futureLtt, 0)} |`,
    );
    log(`| Ticks with no LTT | ${all.reduce((n, s) => n + s.nullLtt, 0)} |`);
    log(
      `| Silences > ${SILENCE_MS / 1000}s while connected | ${silences} (longest ${fmt(longestSilence || null)}) |`,
    );
    log(`| Reconnects | ${reconnects} |`);
    log(
      `| Packet kinds seen | ${[...packetCodes].map(([k, v]) => `${k}=${v}`).join(', ') || 'none'} |`,
    );
    log('');
    log('## Per symbol (worst gaps first)');
    log('| Symbol | Ticks | Gap p50 | Gap p99 | Gap max | Skew p50 |');
    log('| --- | --- | --- | --- | --- | --- |');
    for (const [symbol, s] of [...stats].sort(
      (a, b) =>
        (percentile(b[1].gaps, 99) ?? Number.MAX_SAFE_INTEGER) -
        (percentile(a[1].gaps, 99) ?? Number.MAX_SAFE_INTEGER),
    ))
      log(
        `| ${symbol} | ${s.ticks} | ${fmt(percentile(s.gaps, 50))} | ${fmt(percentile(s.gaps, 99))} | ${fmt(s.gaps.length ? Math.max(...s.gaps) : null)} | ${fmt(percentile(s.skews, 50))} |`,
      );
    if (events.length) {
      log('');
      log('## Events');
      for (const e of events) log(`- ${e}`);
    }
    log('');
    log(
      'Market-status packet: ' +
        ([...packetCodes.keys()].some((k) => k.startsWith('other:'))
          ? 'unknown packet codes were seen (listed above) — inspect before assuming one is market status.'
          : 'none seen; v2 docs list no such packet. Market status stays on Fyers + the exchange calendar.'),
    );
    if (values.out) writeFileSync(values.out, `${lines.join('\n')}\n`);
  } finally {
    await handle.close();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
