import { FILTER_LIMITS, type FilterNode, isMetricKey, type METRIC_KEYS } from '@equitywise/core';
import { z } from 'zod';

/**
 * Shape validation for the screener API (plan §5.1, §11). Zod checks the
 * SHAPE at the boundary; `validateFilter` in core checks the MEANING (units,
 * options, admin-only metrics) — both run before anything reaches SQL.
 */

const metricKey = z
  .string()
  .refine(isMetricKey, { message: 'Unknown metric.' })
  .transform((v) => v as (typeof METRIC_KEYS)[number]);

const leafValue = z.union([
  z.number().finite(),
  z.tuple([z.number().finite(), z.number().finite()]),
  z.boolean(),
  z.string().max(80),
  z.array(z.string().max(80)).max(50),
]);

const leafSchema = z
  .object({
    metric: metricKey,
    cmp: z.enum(['gt', 'gte', 'lt', 'lte', 'between', 'within', 'is', 'in']),
    value: leafValue.optional(),
    rhsMetric: metricKey.optional(),
  })
  .strict();

export const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    z
      .object({
        op: z.enum(['and', 'or']),
        children: z.array(filterNodeSchema).min(1).max(FILTER_LIMITS.leaves),
      })
      .strict(),
    leafSchema,
  ]),
) as z.ZodType<FilterNode>;

/** `all`, `index:<key>` or `watchlist:<id>`. */
export const universeSchema = z
  .string()
  .regex(/^(all|index:[a-z0-9]{1,40}|watchlist:\d{1,9})$/, 'Unknown universe.')
  .default('all');

/** `<metric|symbol>:<asc|desc>`. */
export const sortSchema = z
  .string()
  .regex(/^[A-Za-z0-9]+:(asc|desc)$/, 'Unknown sort.')
  .refine((v) => {
    const key = v.split(':')[0] ?? '';
    return key === 'symbol' || isMetricKey(key);
  }, 'Unknown sort.')
  .default('rsRank:desc');

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

export const runScreenSchema = z
  .object({
    filter: filterNodeSchema.nullable().default(null),
    universe: universeSchema,
    sort: sortSchema,
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).max(10_000).default(0),
    asOf: dateKey.optional(),
  })
  .strict();
export type RunScreenInput = z.infer<typeof runScreenSchema>;

export const countsSchema = z
  .object({
    filter: filterNodeSchema.nullable().default(null),
    universe: universeSchema,
    asOf: dateKey.optional(),
  })
  .strict();
export type CountsInput = z.infer<typeof countsSchema>;

export const savedScreenSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name the screen.')
      .max(80, 'Keep the name under 80 characters.'),
    filter: filterNodeSchema,
    columns: z.array(metricKey).min(1).max(20),
    sort: sortSchema,
    universe: universeSchema,
  })
  .strict();
export type SavedScreenBody = z.infer<typeof savedScreenSchema>;

export const savedScreenPatchSchema = savedScreenSchema.partial().strict();

/**
 * A filter carried in the URL: base64url(JSON). Returns null on anything
 * malformed — a bad link opens an empty screen, never an error page.
 */
export function decodeFilterParam(raw: string | undefined): FilterNode | null {
  if (raw === undefined || raw === '' || raw.length > 8000) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = filterNodeSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
