/**
 * Deterministic classification and display metadata for corporate announcements.
 *
 * Pure and testable: no DB, no clock. It turns a free-text exchange category
 * (BSE's `CATEGORYNAME` is inconsistent) plus the headline into a stable
 * display **bucket** with a tone, and decides whether a filing is "high impact".
 *
 * `HIGH_IMPACT_PATTERNS` is the single source of truth for what counts as high
 * impact. The server passes it to the repository's `matchPatterns` for the
 * "Key filings only" filter, and this module reuses the same keywords for the
 * per-row highlight — so the badge and the filter can never disagree.
 */

export type AnnouncementBucket =
  | 'results'
  | 'dividend'
  | 'buyback'
  | 'split'
  | 'bonus'
  | 'board_meeting'
  | 'management'
  | 'ratings'
  | 'orders'
  | 'other';

export interface AnnouncementMeta {
  readonly bucket: AnnouncementBucket;
  readonly label: string;
  /** Badge variant from the design system. */
  readonly tone: 'bullish' | 'bearish' | 'neutral' | 'warning' | 'secondary';
  readonly highImpact: boolean;
}

/** Ordered rules: the first whose keyword matches wins. */
const RULES: ReadonlyArray<{
  readonly bucket: AnnouncementBucket;
  readonly label: string;
  readonly tone: AnnouncementMeta['tone'];
  readonly highImpact: boolean;
  readonly keywords: readonly string[];
}> = [
  {
    bucket: 'results',
    label: 'Results',
    tone: 'bullish',
    highImpact: true,
    keywords: ['result', 'financial statement', 'quarterly', 'earnings'],
  },
  {
    bucket: 'dividend',
    label: 'Dividend',
    tone: 'bullish',
    highImpact: true,
    keywords: ['dividend'],
  },
  {
    bucket: 'buyback',
    label: 'Buyback',
    tone: 'bullish',
    highImpact: true,
    keywords: ['buyback', 'buy back', 'buy-back'],
  },
  { bucket: 'bonus', label: 'Bonus', tone: 'bullish', highImpact: true, keywords: ['bonus'] },
  {
    bucket: 'split',
    label: 'Split',
    tone: 'warning',
    highImpact: true,
    keywords: ['split', 'sub-division', 'subdivision', 'face value'],
  },
  {
    bucket: 'orders',
    label: 'Order / Deal',
    tone: 'bullish',
    highImpact: true,
    keywords: ['order', 'contract', 'bags', 'wins', 'acquisition', 'merger', 'amalgamation'],
  },
  {
    bucket: 'board_meeting',
    label: 'Board meeting',
    tone: 'neutral',
    highImpact: true,
    keywords: ['board meeting', 'board of directors'],
  },
  {
    bucket: 'ratings',
    label: 'Rating',
    tone: 'warning',
    highImpact: false,
    keywords: ['rating', 'credit rating'],
  },
  {
    bucket: 'management',
    label: 'Management',
    tone: 'neutral',
    highImpact: false,
    keywords: ['appointment', 'resignation', 'cessation', 'director', 'auditor'],
  },
];

const OTHER: AnnouncementMeta = {
  bucket: 'other',
  label: 'Update',
  tone: 'secondary',
  highImpact: false,
};

/** SQL ILIKE patterns for the high-impact filter — derived from the rules above. */
export const HIGH_IMPACT_PATTERNS: readonly string[] = RULES.filter((r) => r.highImpact).flatMap(
  (r) => r.keywords.map((k) => `%${k}%`),
);

/** Classifies an announcement from its category and headline. */
export function announcementMeta(category: string | null, headline: string): AnnouncementMeta {
  const haystack = `${category ?? ''} ${headline}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return {
        bucket: rule.bucket,
        label: rule.label,
        tone: rule.tone,
        highImpact: rule.highImpact,
      };
    }
  }
  return OTHER;
}

export type DateRange = 'all' | 'today' | 'week' | 'month';

export const DATE_RANGES: ReadonlyArray<{ readonly id: DateRange; readonly label: string }> = [
  { id: 'all', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];

export function isDateRange(value: string): value is DateRange {
  return value === 'all' || value === 'today' || value === 'week' || value === 'month';
}

/**
 * The `since` cutoff (UTC instant) for a date range, measured in IST calendar
 * days. `all` returns null. `now` is a parameter so this stays pure/testable.
 */
export function rangeSince(range: DateRange, now: Date): Date | null {
  if (range === 'all') return null;
  // Start of today in IST, expressed as a UTC instant (IST = UTC+5:30).
  const istNow = new Date(now.getTime() + 330 * 60_000);
  const startOfIstDayUtc =
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - 330 * 60_000;
  if (range === 'today') return new Date(startOfIstDayUtc);
  if (range === 'week') return new Date(startOfIstDayUtc - 6 * 86_400_000);
  return new Date(startOfIstDayUtc - 29 * 86_400_000);
}

export type RelativeDayBucket = 'today' | 'yesterday' | 'week' | 'earlier';

export const RELATIVE_DAY_LABEL: Record<RelativeDayBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Earlier this week',
  earlier: 'Earlier',
};

/** Which relative-day header an announcement falls under, in IST. */
export function relativeDayBucket(announcedAtIso: string, now: Date): RelativeDayBucket {
  const dayMs = 86_400_000;
  const toIstDayIndex = (d: Date): number => Math.floor((d.getTime() + 330 * 60_000) / dayMs);
  const diff = toIstDayIndex(now) - toIstDayIndex(new Date(announcedAtIso));
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff <= 6) return 'week';
  return 'earlier';
}
