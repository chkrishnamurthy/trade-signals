import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { type MarketEventUpsert, resolveInstrumentIds, upsertMarketEvents } from '@equitywise/db';
import {
  type CalendarConfig,
  calendarConfigSchema,
  type MarketCalendarConfig,
  marketCalendarConfigSchema,
  marketEventInstant,
} from '@equitywise/shared';
import { parse } from 'yaml';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';

const EVENT_CONFIG_PATH = fileURLToPath(
  new URL('../../../../config/market-calendar.yaml', import.meta.url),
);
const NSE_CALENDAR_PATH = fileURLToPath(
  new URL('../../../../config/nse-calendar.yaml', import.meta.url),
);

interface Schema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: readonly { path: readonly PropertyKey[]; message: string }[];
        };
      };
}

function parseConfig<T>(raw: string, file: string, schema: Schema<T>): T {
  const result = schema.safeParse(parse(raw));
  if (result.success) return result.data;
  throw new Error(
    `${file} is invalid: ${result.error.issues
      .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
      .join('; ')}`,
  );
}

export async function loadMarketCalendarConfigs(
  paths: { events?: string; exchange?: string } = {},
): Promise<{ events: MarketCalendarConfig; exchange: CalendarConfig }> {
  const [eventsRaw, exchangeRaw] = await Promise.all([
    readFile(paths.events ?? EVENT_CONFIG_PATH, 'utf8'),
    readFile(paths.exchange ?? NSE_CALENDAR_PATH, 'utf8'),
  ]);
  return {
    events: parseConfig(eventsRaw, 'config/market-calendar.yaml', marketCalendarConfigSchema),
    exchange: parseConfig(exchangeRaw, 'config/nse-calendar.yaml', calendarConfigSchema),
  };
}

export function buildMarketCalendarRows(
  events: MarketCalendarConfig,
  exchange: CalendarConfig,
  instrumentIds: ReadonlyMap<string, number>,
): MarketEventUpsert[] {
  const configured: MarketEventUpsert[] = events.events.map((event) => {
    const symbol = event.symbol?.trim().toUpperCase() ?? null;
    return {
      sourceKey: event.key,
      instrumentId: symbol === null ? null : (instrumentIds.get(symbol) ?? null),
      symbol,
      eventType: event.event_type,
      eventCategory: event.event_category ?? null,
      title: event.title,
      description: event.description ?? null,
      eventDate: event.event_date,
      eventTime: marketEventInstant(event.event_date, event.event_time ?? null),
      sourceName: event.source_name ?? null,
      sourceUrl: event.source_url ?? null,
      importance: event.importance ?? null,
      metadata: {
        ...(event.why_this_matters === undefined ? {} : { whyThisMatters: event.why_this_matters }),
        ...(event.what_to_watch === undefined ? {} : { whatToWatch: event.what_to_watch }),
      },
    };
  });

  const holidays: MarketEventUpsert[] = exchange.holidays.map((holiday) => ({
    sourceKey: `nse-holiday:${holiday.date}`,
    instrumentId: null,
    symbol: null,
    eventType: 'market_holiday',
    eventCategory: 'nse_equity_holiday',
    title: holiday.name,
    description: `NSE equity trading is closed for ${holiday.name}.`,
    eventDate: holiday.date,
    eventTime: null,
    sourceName: 'NSE',
    sourceUrl: null,
    importance: 'high',
    metadata: {
      whyThisMatters: 'Regular NSE equity trading is unavailable on this date.',
      whatToWatch: ['Check the exchange calendar for the next regular trading session.'],
    },
  }));

  const rows = [...configured, ...holidays];
  const keys = new Set<string>();
  for (const row of rows) {
    if (keys.has(row.sourceKey)) throw new Error(`Duplicate market event key: ${row.sourceKey}`);
    keys.add(row.sourceKey);
  }
  return rows;
}

export async function marketCalendarSync(
  context: WorkerContext,
  log: Logger,
): Promise<{ written: number; unresolvedSymbols: readonly string[] }> {
  const startedAt = Date.now();
  const configs = await loadMarketCalendarConfigs();
  const symbols = [
    ...new Set(
      configs.events.events.flatMap((event) =>
        event.symbol === null || event.symbol === undefined
          ? []
          : [event.symbol.trim().toUpperCase()],
      ),
    ),
  ];
  const instrumentIds = await resolveInstrumentIds(context.db, symbols);
  const rows = buildMarketCalendarRows(configs.events, configs.exchange, instrumentIds);
  const written = await upsertMarketEvents(context.db, rows);
  const unresolvedSymbols = symbols.filter((symbol) => !instrumentIds.has(symbol));
  if (unresolvedSymbols.length > 0)
    log.warn('calendar events have unresolved symbols', { symbols: unresolvedSymbols });
  log.info('market calendar synchronized', {
    configured: configs.events.events.length,
    holidays: configs.exchange.holidays.length,
    written,
    durationMs: Date.now() - startedAt,
  });
  return { written, unresolvedSymbols };
}
