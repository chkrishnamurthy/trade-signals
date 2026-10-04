import 'server-only';
import {
  listInstrumentsById,
  listMarketEvents,
  listOwnerWatchedInstrumentIds,
  marketEventSummary,
} from '@equitywise/db';
import {
  CORPORATE_ACTION_TYPES,
  type MarketCalendarResponse,
  type MarketEventMetadata,
  type MarketEventType,
  marketCalendarDateRanges,
} from '@equitywise/shared';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';
import type { MarketCalendarQueryInput } from './market-calendar-schemas';

const FALLBACK_DESCRIPTION: Record<MarketEventType, string> = {
  market_holiday: 'The NSE equity market is closed for the published market holiday.',
  result: 'The company is expected to publish a financial result update.',
  board_meeting: 'The company has scheduled a board meeting for the stated date.',
  dividend: 'The company has published a dividend-related corporate action date.',
  bonus: 'The company has published a bonus-share corporate action date.',
  stock_split: 'The company has published a stock-split corporate action date.',
  rights_issue: 'The company has published a rights-issue event date.',
  buyback: 'The company has published a buyback-related event date.',
  ipo: 'This date is part of the published IPO timetable.',
  corporate_announcement: 'A company-related announcement is scheduled for this date.',
};

const FALLBACK_MATTERS: Record<MarketEventType, string> = {
  market_holiday: 'Regular NSE equity trading is unavailable on this date.',
  result: 'The release updates the company’s reported financial record.',
  board_meeting: 'The meeting may produce formal decisions or disclosures from the company.',
  dividend: 'The event records a company distribution and its relevant dates.',
  bonus: 'The event records a change in the number of shares through a bonus issue.',
  stock_split: 'The event records a change in share denomination and outstanding share count.',
  rights_issue: 'The event records an offer made to eligible existing shareholders.',
  buyback: 'The event records a company proposal or process to repurchase shares.',
  ipo: 'The event marks a published milestone in a company’s public-listing process.',
  corporate_announcement: 'The announcement may update the company’s public disclosure record.',
};

const FALLBACK_WATCH: Record<MarketEventType, readonly string[]> = {
  market_holiday: ['Check the exchange calendar for the next regular trading session.'],
  result: ['Read the filed financial statements and accompanying notes when published.'],
  board_meeting: ['Check the company’s post-meeting exchange filing for confirmed decisions.'],
  dividend: ['Verify the declared amount and the company’s published record and payment dates.'],
  bonus: ['Verify the approved ratio and published eligibility date.'],
  stock_split: ['Verify the approved ratio and published effective date.'],
  rights_issue: ['Verify the issue terms, eligibility date, and published timetable.'],
  buyback: ['Verify the approved method, dates, and terms in the company filing.'],
  ipo: ['Verify the published timetable and any exchange updates.'],
  corporate_announcement: ['Read the original company or exchange source when it is published.'],
};

function safeSourceUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function explainedMetadata(
  type: MarketEventType,
  metadata: MarketEventMetadata,
): MarketEventMetadata {
  return {
    whyThisMatters: metadata.whyThisMatters ?? FALLBACK_MATTERS[type],
    whatToWatch: metadata.whatToWatch ?? FALLBACK_WATCH[type],
  };
}

export async function getMarketCalendar(
  input: MarketCalendarQueryInput,
  now = new Date(),
): Promise<MarketCalendarResponse> {
  const user = await getSessionUser();
  if (user === null)
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });

  const db = getDatabase();
  const ranges = marketCalendarDateRanges(now);
  const selected =
    input.from === undefined || input.to === undefined
      ? ranges.month
      : { from: input.from, to: input.to };
  const watchedIds = await listOwnerWatchedInstrumentIds(db, user.id);
  const watchedInstruments = await listInstrumentsById(db, watchedIds);
  const watchedSymbols = watchedInstruments.map((instrument) => instrument.symbol.toUpperCase());
  const watchlistScope = { instrumentIds: watchedIds, symbols: watchedSymbols };

  const [rows, summary] = await Promise.all([
    listMarketEvents(db, {
      ...selected,
      ...(input.eventType === undefined ? {} : { eventType: input.eventType }),
      ...(input.watchlistOnly ? { scope: watchlistScope } : {}),
    }),
    marketEventSummary(db, {
      today: ranges.today,
      week: ranges.week,
      upcoming: ranges.upcoming,
      watchlistScope,
      corporateActionTypes: CORPORATE_ACTION_TYPES,
    }),
  ]);

  const watchedIdSet = new Set(watchedIds);
  const watchedSymbolSet = new Set(watchedSymbols);
  return {
    events: rows.map((row) => ({
      id: row.id,
      instrumentId: row.instrumentId,
      symbol: row.symbol,
      companyName: row.companyName,
      eventType: row.eventType,
      eventCategory: row.eventCategory,
      title: row.title,
      description: row.description ?? FALLBACK_DESCRIPTION[row.eventType],
      eventDate: row.eventDate,
      eventTime: row.eventTime?.toISOString() ?? null,
      sourceName: row.sourceName,
      sourceUrl: safeSourceUrl(row.sourceUrl),
      importance: row.importance,
      metadata: explainedMetadata(row.eventType, row.metadata),
      onWatchlist:
        (row.instrumentId !== null && watchedIdSet.has(row.instrumentId)) ||
        (row.symbol !== null && watchedSymbolSet.has(row.symbol.toUpperCase())),
    })),
    summary,
    filters: {
      ...selected,
      eventType: input.eventType ?? null,
      watchlistOnly: input.watchlistOnly,
    },
    hasWatchlists: watchedIds.length > 0,
    nowIso: now.toISOString(),
  };
}
