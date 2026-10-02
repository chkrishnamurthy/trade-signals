import { IPO_BOARDS, IPO_EXCHANGES, IPO_STATUSES } from '@equitywise/shared';
import { z } from 'zod';

/**
 * Query validation for `/api/ipos*` and the `/ipos` pages (plan §9). One
 * schema per endpoint; an invalid filter is a 400 with the field named, never
 * a silently ignored parameter.
 */

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

export const ipoListQuerySchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(IPO_STATUSES).optional()),
  board: z.preprocess(blankToUndefined, z.enum(IPO_BOARDS).optional()),
  exchange: z.preprocess(
    (v) => (typeof v === 'string' && v !== '' ? v.toUpperCase() : undefined),
    z.enum(IPO_EXCHANGES).optional(),
  ),
  q: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(500).default(1)),
});
export type IpoListQuery = z.infer<typeof ipoListQuerySchema>;

/**
 * `/ipos/mainboard` and `/ipos/sme`: the board is the route, so only status,
 * year (`all` for every year; absent = this year), search and page.
 */
export const ipoBoardListQuerySchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(IPO_STATUSES).optional()),
  year: z.preprocess(
    blankToUndefined,
    z.union([z.literal('all'), z.coerce.number().int().min(2000).max(2100)]).optional(),
  ),
  q: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(500).default(1)),
});
export type IpoBoardListQuery = z.infer<typeof ipoBoardListQuerySchema>;

/** `/ipos?board=sme`: the dashboard's board switch; mainboard when absent. */
export const ipoDashboardQuerySchema = z.object({
  board: z.preprocess(blankToUndefined, z.enum(IPO_BOARDS).default('mainboard')),
});

export const ipoCalendarQuerySchema = z
  .object({ from: dateKey, to: dateKey })
  .refine((v) => v.from <= v.to, 'The range must start on or before its end.')
  .refine((v) => {
    const days = (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000;
    return days <= 62;
  }, 'The range can span at most 62 days.');

export const gmpTrackQuerySchema = z.object({
  months: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(36).default(12)),
  board: z.preprocess(blankToUndefined, z.enum(IPO_BOARDS).optional()),
});

export const ipoSlugSchema = z.string().regex(/^[a-z0-9-]{3,120}$/, 'Unknown IPO.');

/** `URLSearchParams` → a plain object the schemas read (first value wins). */
export function searchParamsObject(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
) {
  const out: Record<string, string> = {};
  if (params instanceof URLSearchParams) {
    for (const [k, v] of params) if (!(k in out)) out[k] = v;
  } else {
    for (const [k, v] of Object.entries(params)) {
      const first = Array.isArray(v) ? v[0] : v;
      if (first !== undefined) out[k] = first;
    }
  }
  return out;
}
