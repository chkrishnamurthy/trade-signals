import { z } from 'zod';
import { fromIstParts, istDateKey, istParts } from './time.js';

export const MARKET_EVENT_TYPES = [
  'market_holiday',
  'result',
  'board_meeting',
  'dividend',
  'bonus',
  'stock_split',
  'rights_issue',
  'buyback',
  'ipo',
  'corporate_announcement',
] as const;

export type MarketEventType = (typeof MARKET_EVENT_TYPES)[number];

export const MARKET_EVENT_IMPORTANCE = ['low', 'medium', 'high'] as const;
export type MarketEventImportance = (typeof MARKET_EVENT_IMPORTANCE)[number];

export const MARKET_CALENDAR_RANGES = ['today', 'week', 'month'] as const;
export type MarketCalendarRange = (typeof MARKET_CALENDAR_RANGES)[number];

export const CORPORATE_ACTION_TYPES = [
  'dividend',
  'bonus',
  'stock_split',
  'rights_issue',
  'buyback',
] as const satisfies readonly MarketEventType[];

export const MARKET_EVENT_LABELS: Record<MarketEventType, string> = {
  market_holiday: 'Market holiday',
  result: 'Result announcement',
  board_meeting: 'Board meeting',
  dividend: 'Dividend',
  bonus: 'Bonus',
  stock_split: 'Stock split',
  rights_issue: 'Rights issue',
  buyback: 'Buyback',
  ipo: 'IPO event',
  corporate_announcement: 'Corporate announcement',
};

export interface MarketEventMetadata {
  readonly whyThisMatters?: string;
  readonly whatToWatch?: readonly string[];
}

export interface MarketEventDto {
  readonly id: number;
  readonly instrumentId: number | null;
  readonly symbol: string | null;
  readonly companyName: string | null;
  readonly eventType: MarketEventType;
  readonly eventCategory: string | null;
  readonly title: string;
  readonly description: string | null;
  /** Exchange-local IST calendar date, `YYYY-MM-DD`. */
  readonly eventDate: string;
  /** UTC ISO-8601 instant, or null when no time was supplied. */
  readonly eventTime: string | null;
  readonly sourceName: string | null;
  readonly sourceUrl: string | null;
  readonly importance: MarketEventImportance | null;
  readonly metadata: MarketEventMetadata;
  readonly onWatchlist: boolean;
}

export interface MarketCalendarSummary {
  readonly today: number;
  readonly thisWeekResults: number;
  readonly upcomingCorporateActions: number;
  readonly watchlistRelated: number;
}

export interface MarketCalendarResponse {
  readonly events: readonly MarketEventDto[];
  readonly summary: MarketCalendarSummary;
  readonly filters: {
    readonly from: string;
    readonly to: string;
    readonly eventType: MarketEventType | null;
    readonly watchlistOnly: boolean;
  };
  readonly hasWatchlists: boolean;
  readonly nowIso: string;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function dateParts(value: string): { year: number; month: number; day: number } | null {
  if (!DATE_KEY_PATTERN.test(value)) return null;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    return null;
  return { year, month, day };
}

export function isMarketDateKey(value: string): boolean {
  return dateParts(value) !== null;
}

export const marketDateKeySchema = z
  .string()
  .refine(isMarketDateKey, 'Use a valid date in YYYY-MM-DD format.');

const sourceUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  }, 'Source URL must use HTTP or HTTPS.');

export const marketCalendarEventConfigSchema = z
  .object({
    key: z.string().trim().min(1).max(200),
    symbol: z.string().trim().min(1).max(40).nullable().optional(),
    event_type: z.enum(MARKET_EVENT_TYPES),
    event_category: z.string().trim().min(1).max(100).nullable().optional(),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(2_000).nullable().optional(),
    event_date: marketDateKeySchema,
    event_time: z.string().regex(TIME_PATTERN, 'Use a 24-hour HH:mm time.').nullable().optional(),
    source_name: z.string().trim().min(1).max(100).nullable().optional(),
    source_url: sourceUrlSchema.nullable().optional(),
    importance: z.enum(MARKET_EVENT_IMPORTANCE).nullable().optional(),
    why_this_matters: z.string().trim().min(1).max(2_000).optional(),
    what_to_watch: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
  })
  .strict();

export type MarketCalendarEventConfig = z.infer<typeof marketCalendarEventConfigSchema>;

export const marketCalendarConfigSchema = z
  .object({ events: z.array(marketCalendarEventConfigSchema).max(5_000) })
  .strict()
  .superRefine((value, context) => {
    const keys = new Set<string>();
    for (const [index, event] of value.events.entries()) {
      if (keys.has(event.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['events', index, 'key'],
          message: `Duplicate event key: ${event.key}`,
        });
      }
      keys.add(event.key);
    }
  });

export type MarketCalendarConfig = z.infer<typeof marketCalendarConfigSchema>;

/** Converts an exchange-local date and optional `HH:mm` IST value to a UTC instant. */
export function marketEventInstant(eventDate: string, eventTime: string | null): Date | null {
  if (eventTime === null) return null;
  const date = dateParts(eventDate);
  const match = TIME_PATTERN.exec(eventTime);
  if (date === null || match === null) throw new RangeError('Invalid market event date or time');
  const [hourText, minuteText] = eventTime.split(':');
  return fromIstParts({
    ...date,
    hour: Number(hourText),
    minute: Number(minuteText),
  });
}

function keyFromUtcDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addMarketDays(dateKey: string, days: number): string {
  const parts = dateParts(dateKey);
  if (parts === null || !Number.isInteger(days)) throw new RangeError('Invalid calendar date');
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return keyFromUtcDate(date);
}

export interface DateKeyRange {
  readonly from: string;
  readonly to: string;
}

export interface MarketCalendarDateRanges {
  readonly today: DateKeyRange;
  readonly week: DateKeyRange;
  readonly month: DateKeyRange;
  readonly upcoming: DateKeyRange;
}

/** Calendar windows anchored to the supplied instant and interpreted in IST. */
export function marketCalendarDateRanges(now: Date): MarketCalendarDateRanges {
  const today = istDateKey(now);
  const parts = istParts(now);
  const daysFromMonday = (parts.weekday + 6) % 7;
  const monthStart = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-01`;
  const nextMonth = new Date(Date.UTC(parts.year, parts.month, 1));
  const monthEnd = keyFromUtcDate(new Date(nextMonth.getTime() - 86_400_000));
  return {
    today: { from: today, to: today },
    week: {
      from: addMarketDays(today, -daysFromMonday),
      to: addMarketDays(today, 6 - daysFromMonday),
    },
    month: { from: monthStart, to: monthEnd },
    upcoming: { from: today, to: addMarketDays(today, 30) },
  };
}

export function selectedMarketCalendarRange(range: MarketCalendarRange, now: Date): DateKeyRange {
  return marketCalendarDateRanges(now)[range];
}
