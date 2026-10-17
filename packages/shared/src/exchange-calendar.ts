import { z } from 'zod';

/**
 * The NSE exchange calendar: which days the market trades, and when.
 *
 * `ExchangeSession` is one day's answer; `CalendarConfig` is the versioned
 * `config/nse-calendar.yaml` it is computed from. The worker uses them to skip
 * holidays and weekends in its in-session jobs.
 */

export const exchangeSessionKindSchema = z.enum([
  'NORMAL',
  'HOLIDAY',
  'SPECIAL',
  'MUHURAT',
  'CLOSED_UNSCHEDULED',
  'WEEKEND',
]);
export type ExchangeSessionKind = z.infer<typeof exchangeSessionKindSchema>;
export const exchangeSessionSchema = z.object({
  tradingDate: z.string(),
  kind: exchangeSessionKindSchema,
  /** ms UTC; null when the exchange is closed. */
  openAt: z.number().int().nullable(),
  closeAt: z.number().int().nullable(),
  entryCutoffAt: z.number().int().nullable(),
  squareOffAt: z.number().int().nullable(),
  note: z.string().nullable(),
});
export type ExchangeSession = z.infer<typeof exchangeSessionSchema>;

/** `config/nse-calendar.yaml`: operator-verified from NSE's published circulars. */
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM');
export const calendarConfigSchema = z
  .object({
    exchange: z.literal('NSE'),
    /** The last date this file was checked against the exchange's list. */
    verifiedThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timings: z.object({
      open: hhmm,
      close: hhmm,
      entryCutoff: hhmm,
      squareOff: hhmm,
    }),
    holidays: z.array(
      z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string() }),
    ),
    specialSessions: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        kind: z.enum(['SPECIAL', 'MUHURAT']),
        name: z.string(),
        open: hhmm,
        close: hhmm,
        entryCutoff: hhmm,
        squareOff: hhmm,
      }),
    ),
  })
  .strict();
export type CalendarConfig = z.infer<typeof calendarConfigSchema>;
