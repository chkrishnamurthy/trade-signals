import { isMarketDateKey, MARKET_EVENT_TYPES } from '@equitywise/shared';
import { z } from 'zod';

function dateNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export const marketCalendarQuerySchema = z
  .object({
    from: z
      .string()
      .refine(isMarketDateKey, 'Use a valid from date in YYYY-MM-DD format.')
      .optional(),
    to: z.string().refine(isMarketDateKey, 'Use a valid to date in YYYY-MM-DD format.').optional(),
    eventType: z.enum(MARKET_EVENT_TYPES).optional(),
    watchlistOnly: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.from === undefined) !== (value.to === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from and to must be supplied together.',
      });
      return;
    }
    if (value.from === undefined || value.to === undefined) return;
    const from = dateNumber(value.from);
    const to = dateNumber(value.to);
    if (from > to) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'from must not be after to.' });
      return;
    }
    if ((to - from) / 86_400_000 > 365)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The market calendar range may not exceed 366 days.',
      });
  });

export type MarketCalendarQueryInput = z.output<typeof marketCalendarQuerySchema>;
