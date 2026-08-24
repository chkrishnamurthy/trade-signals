import { z } from 'zod';

/**
 * Zod schemas for every watchlist request body.
 *
 * The project convention is a schema at every boundary, and the watchlist
 * endpoints need it more than most: `filters` and `sort` are stored as `jsonb`,
 * so an unvalidated body is written to the database verbatim and read back into
 * the table renderer on the next page load. Parsing here is what stops a
 * malformed layout from being persisted and then breaking the page every time
 * it is opened.
 *
 * Deliberately permissive about column IDS — they are matched against the
 * registry at render time and unknown ones are dropped there (removing a column
 * in code must not invalidate a saved layout). Deliberately strict about SHAPE.
 */

const columnId = z.string().min(1).max(64);

export const sortRuleSchema = z.object({
  columnId,
  direction: z.enum(['asc', 'desc']),
});

const rangeSchema = z.object({
  min: z.number().finite().nullable(),
  max: z.number().finite().nullable(),
});

export const filterStateSchema = z.object({
  query: z.string().max(200).optional(),
  sectors: z.array(z.string().min(1).max(80)).max(50).optional(),
  exchanges: z.array(z.string().min(1).max(16)).max(10).optional(),
  direction: z.enum(['all', 'advancing', 'declining', 'unchanged']).optional(),
  ranges: z.record(columnId, rangeSchema).optional(),
  flags: z.array(z.string().min(1).max(64)).max(30).optional(),
});

export const layoutSchema = z.object({
  // Bounded: a layout is a table the user reads, and an unbounded array here is
  // an unbounded array written to the database.
  columns: z.array(columnId).max(60),
  sort: z.array(sortRuleSchema).max(5),
  filters: filterStateSchema,
  quickView: z.string().min(1).max(64).nullable(),
});

export const createWatchlistSchema = z.object({
  name: z.string().trim().min(1, 'Name a watchlist something').max(60),
});

export const updateWatchlistSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    isDefault: z.literal(true).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.isDefault !== undefined,
    'Nothing to update',
  );

export const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

export const addItemsSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(40)).min(1).max(100),
});

export const removeItemsSchema = z.object({
  instrumentIds: z.array(z.number().int().positive()).min(1).max(500),
});

export const reorderItemsSchema = z.object({
  instrumentIds: z.array(z.number().int().positive()).min(1).max(1000),
});

export const saveViewSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** True stores it against every watchlist rather than only this one. */
  global: z.boolean().optional(),
  columns: z.array(columnId).max(60),
  sort: z.array(sortRuleSchema).max(5),
  filters: filterStateSchema,
});
