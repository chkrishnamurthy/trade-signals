/**
 * Replay the intraday strategy (ORB-VC) over stored candles, one session at a
 * time. Reads only; never calls a provider; writes nothing.
 *
 *   pnpm replay:intraday --date 2026-09-17
 *   pnpm replay:intraday --from 2026-09-01 --to 2026-09-17 [--symbol RELIANCE] [--csv out.csv]
 *
 * The daily check (plan §9): after the close, the replay for today must match
 * the live page on every signal, level and reason. Fills may differ (sampled
 * quote vs. next 1-minute open) and live outcomes may be Unavailable.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ORB_CONFIG, replaySession } from '@equitywise/core';
import {
  createDatabase,
  getDailyBars,
  getSignalBars,
  getSignalMinutes,
  signalUniverseInstruments,
} from '@equitywise/db';
import { formatPaise, fromIstParts, istDateKey, isWeekend, sessionOpen } from '@equitywise/shared';
import { config as loadEnv } from 'dotenv';
import { loadIntradaySettings } from '../apps/worker/src/jobs/intraday-orb.js';
import { loadIndexConstituents } from '../apps/worker/src/universe.js';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const { values } = parseArgs({
  options: {
    date: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    symbol: { type: 'string' },
    csv: { type: 'string' },
  },
});
const day = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Bad date ${s}`);
  return fromIstParts({ year: y, month: m, day: d, hour: 9, minute: 15 }).getTime();
};
const from = day(values.from ?? values.date ?? istDateKey(new Date()));
const to = day(values.to ?? values.date ?? istDateKey(new Date()));
const ist = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

async function main() {
  const settings = await loadIntradaySettings();
  const universe = (await loadIndexConstituents(settings.universe)).filter(
    (u) => !values.symbol || u.symbol === values.symbol.toUpperCase(),
  );
  const handle = createDatabase({});
  if (values.csv)
    writeFileSync(
      values.csv,
      'date,symbol,direction,signalAt,ref,stop,target1,target2,fill,shares,status,exitReasons,netPaise\n',
    );
  let total = 0;
  let sessions = 0;
  try {
    const instruments = await signalUniverseInstruments(handle.db);
    const benchmark = instruments.find((i) => i.symbol === 'NIFTY50' && i.kind === 'index');
    for (let open = from; open <= to; open += 86_400_000) {
      if (isWeekend(new Date(open))) continue;
      const date = istDateKey(new Date(open));
      const end = sessionOpen(new Date(open)).getTime() + 375 * 60_000;
      const historyFrom = open - settings.historyDays * 86_400_000;
      let indexMoveBps: number | null = null;
      if (benchmark) {
        const [previous] = await getDailyBars(handle.db, {
          instrumentId: benchmark.id,
          from: new Date(open - 30 * 86_400_000),
          to: new Date(open - 1),
          limit: 1,
        });
        const bars = await getSignalBars(handle.db, benchmark.id, open, end);
        const at930 = bars.find((b) => b.timestamp === open + 2 * ORB_CONFIG.barMs);
        if (previous && at930)
          indexMoveBps = ((at930.close - previous.close) * 10_000) / previous.close;
      }
      const stocks = [];
      for (const item of universe) {
        const instrument = instruments.find((i) => i.symbol === item.symbol && i.kind === 'equity');
        if (!instrument) continue;
        const minutes = await getSignalMinutes(handle.db, instrument.id, open, end);
        if (minutes.length === 0) continue;
        stocks.push({
          symbol: item.symbol,
          companyName: item.name,
          tickSize: instrument.tickSize,
          bars: await getSignalBars(handle.db, instrument.id, historyFrom, end),
          minutes,
          daily: await getDailyBars(handle.db, {
            instrumentId: instrument.id,
            from: new Date(open - 60 * 86_400_000),
            to: new Date(open - 1),
            limit: ORB_CONFIG.turnoverSessions,
          }),
        });
      }
      if (stocks.length === 0) {
        console.log(`${date}  no stored minute candles`);
        continue;
      }
      const r = replaySession({
        sessionOpenMs: open,
        stocks,
        indexMoveBps,
        capitalPaise: settings.capitalPaise,
      });
      sessions += 1;
      total += r.netPaise;
      console.log(
        `\n${date}  ${stocks.length} stocks · index move ${indexMoveBps === null ? 'n/a' : `${indexMoveBps.toFixed(0)} bps`} · ${r.signals.length} signals · ${r.taken} taken · net ${formatPaise(r.netPaise)}`,
      );
      if (r.exclusions.length)
        console.log(
          `  excluded: ${r.exclusions.map((e) => `${e.symbol} (${e.reason})`).join(', ')}`,
        );
      for (const s of r.signals) {
        const p = s.projection;
        const l = s.evidence.levels;
        const exits = p.exits
          .map((x) => `${x.reason}@${formatPaise(x.price)}×${x.shares}`)
          .join(' ');
        console.log(
          `  ${ist(s.publishedAt)}  ${s.symbol.padEnd(12)} ${s.evidence.direction.padEnd(4)} ref ${formatPaise(l.ref)}  stop ${formatPaise(l.stop)}  T1 ${formatPaise(l.target1)}  T2 ${formatPaise(l.target2)}  ` +
            `fill ${p.fill === null ? '—' : formatPaise(p.fill)} × ${p.shares}  ${p.status}${p.skipReason ? ` (${p.skipReason})` : ''}  ${exits}  net ${s.realisedNetPaise === null ? '—' : formatPaise(s.realisedNetPaise)}`,
        );
        if (values.csv)
          appendFileSync(
            values.csv,
            `${[
              date,
              s.symbol,
              s.evidence.direction,
              new Date(s.evidence.signalAt).toISOString(),
              l.ref,
              l.stop,
              l.target1,
              l.target2,
              p.fill ?? '',
              p.shares,
              p.status,
              p.exits.map((x) => x.reason).join('|'),
              s.realisedNetPaise ?? '',
            ].join(',')}\n`,
          );
      }
    }
    console.log(
      `\n${sessions} sessions · net ${formatPaise(total)} (simulated, ${ORB_CONFIG.shortName} rev ${ORB_CONFIG.revision})`,
    );
  } finally {
    await handle.close();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
