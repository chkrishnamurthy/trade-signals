import 'server-only';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CATEGORY_LABELS,
  catalogueFor,
  describeLeaf,
  type FilterNode,
  INDEX_OPTIONS,
  isGroup,
  isMetricKey,
  METRIC_CATEGORIES,
  type MetricKey,
  metricDefinition,
  validateFilter,
} from '@equitywise/core';
import {
  conditionCounts,
  countSavedScreens,
  createSavedScreen,
  deleteSavedScreen,
  getWatchlistMembers,
  latestSnapshotBuild,
  listSavedScreens,
  listWatchlists,
  MAX_SAVED_SCREENS,
  runScreen,
  type SavedScreenRow,
  type ScreenUniverse,
  type SnapshotRow,
  snapshotDates,
  snapshotIndustries,
  updateSavedScreen,
} from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  type ConditionCountsDto,
  DEFAULT_COLUMNS,
  type PresetDto,
  type SavedScreenDto,
  type ScreenerCellValue,
  type ScreenerMetaDto,
  type ScreenerRowDto,
  type ScreenResultDto,
} from '@/lib/screener-types';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';
import {
  type CountsInput,
  filterNodeSchema,
  type RunScreenInput,
  type SavedScreenBody,
  sortSchema,
} from './screener-schemas';

/**
 * The screener's server layer (docs/planning/screener-dhan-fyers-plan.md §5).
 *
 * Reads the worker-built snapshot only: no provider call and no recomputation
 * happens on a request. Every filter passes Zod (shape) and `validateFilter`
 * (meaning) before it is compiled to SQL. Signal metrics exist only for admins
 * — for everyone else they are absent from the catalogue, rejected in filters
 * and sorts, and stripped from rows.
 */

interface Viewer {
  readonly userId: number;
  readonly isAdmin: boolean;
}

async function requireViewer(): Promise<Viewer> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  return { userId: user.id, isAdmin: user.role === 'admin' };
}

function invalid(message: string, code = 'INVALID_SCREEN'): MarketDataError {
  return new MarketDataError(message, {
    code,
    status: 400,
    remedy: 'Adjust the screen and try again.',
  });
}

function assertFilter(filter: FilterNode | null, viewer: Viewer): void {
  if (filter === null) return;
  const problems = validateFilter(filter, { isAdmin: viewer.isAdmin });
  const first = problems[0];
  if (first !== undefined) throw invalid(first);
}

function parseSort(
  raw: string,
  viewer: Viewer,
): { metric: MetricKey | 'symbol'; direction: 'asc' | 'desc' } {
  const [key = 'rsRank', dir = 'desc'] = raw.split(':');
  if (key === 'symbol') return { metric: 'symbol', direction: dir === 'asc' ? 'asc' : 'desc' };
  if (!isMetricKey(key)) throw invalid('Unknown sort column.');
  if (metricDefinition(key).adminOnly === true && !viewer.isAdmin)
    throw invalid('Unknown sort column.');
  return { metric: key, direction: dir === 'asc' ? 'asc' : 'desc' };
}

async function resolveUniverse(raw: string, viewer: Viewer): Promise<ScreenUniverse> {
  if (raw === 'all') return { kind: 'all' };
  const [kind, value = ''] = raw.split(':');
  if (kind === 'index') {
    if (!INDEX_OPTIONS.some((o) => o.value === value)) throw invalid('Unknown index.');
    return { kind: 'index', indexKey: value };
  }
  if (kind === 'watchlist') {
    const id = Number(value);
    const members = await getWatchlistMembers(getDatabase(), viewer.userId, id);
    return { kind: 'instruments', instrumentIds: members.map((m) => m.instrumentId) };
  }
  throw invalid('Unknown universe.');
}

/** The session a request screens: `asOf` if it has a snapshot, else the newest. */
async function resolveSession(asOf: string | undefined): Promise<{
  tradingDate: string | null;
  builtAt: string | null;
}> {
  const db = getDatabase();
  const latest = await latestSnapshotBuild(db);
  if (asOf !== undefined) {
    const dates = await snapshotDates(db, 400);
    if (!dates.includes(asOf))
      throw invalid('No snapshot exists for that date.', 'UNKNOWN_SESSION');
    return {
      tradingDate: asOf,
      builtAt: latest?.tradingDate === asOf ? (latest.finishedAt?.toISOString() ?? null) : null,
    };
  }
  return {
    tradingDate: latest?.tradingDate ?? null,
    builtAt: latest?.finishedAt?.toISOString() ?? null,
  };
}

/** Older than 4 calendar days (a long weekend) means the nightly build stopped. */
function isStale(tradingDate: string | null): boolean {
  if (tradingDate === null) return true;
  const today = Date.parse(`${istDateKey(new Date())}T00:00:00Z`);
  return today - Date.parse(`${tradingDate}T00:00:00Z`) > 4 * 86_400_000;
}

const HIDDEN_FROM_USERS: ReadonlySet<string> = new Set(['signalDirection', 'signalStrength']);
/** Non-metric display fields carried alongside the catalogue values. */
const EXTRA_FIELDS = [
  'high52w',
  'low52w',
  'ema20',
  'ema50',
  'ema200',
  'high20d',
  'low20d',
  'supertrendValue',
  'oiAsOf',
  'shareholdingAsOf',
] as const;

export function toRowDto(row: SnapshotRow, isAdmin: boolean): ScreenerRowDto {
  const values: Record<string, ScreenerCellValue> = {};
  const record = row as unknown as Record<string, unknown>;
  for (const def of catalogueFor(isAdmin)) {
    const v = record[def.key];
    values[def.key] = (v === undefined ? null : v) as ScreenerCellValue;
  }
  for (const key of EXTRA_FIELDS) values[key] = (record[key] ?? null) as ScreenerCellValue;
  if (!isAdmin) for (const key of HIDDEN_FROM_USERS) delete values[key];
  return {
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    name: row.name,
    values,
    spark: row.spark ?? null,
    dataIssue: row.dataIssue,
  };
}

export async function runScreenForViewer(input: RunScreenInput): Promise<ScreenResultDto> {
  const viewer = await requireViewer();
  assertFilter(input.filter, viewer);
  const sort = parseSort(input.sort, viewer);
  const universe = await resolveUniverse(input.universe, viewer);
  const session = await resolveSession(input.asOf);
  if (session.tradingDate === null) {
    return {
      tradingDate: null,
      builtAt: null,
      stale: true,
      total: 0,
      base: 0,
      limit: input.limit,
      offset: input.offset,
      rows: [],
    };
  }
  const result = await runScreen(getDatabase(), {
    tradingDate: session.tradingDate,
    filter: input.filter,
    universe,
    sort,
    limit: input.limit,
    offset: input.offset,
  });
  return {
    tradingDate: session.tradingDate,
    builtAt: session.builtAt,
    stale: isStale(session.tradingDate),
    total: result.total,
    base: result.base,
    limit: input.limit,
    offset: input.offset,
    rows: result.rows.map((r) => toRowDto(r, viewer.isAdmin)),
  };
}

/** The top-level conditions a funnel is drawn over. */
function topLevelConditions(filter: FilterNode | null): FilterNode[] {
  if (filter === null) return [];
  if (isGroup(filter) && filter.op === 'and') return [...filter.children];
  return [filter];
}

function conditionLabel(node: FilterNode): string {
  if (!isGroup(node)) return describeLeaf(node);
  return `${node.op === 'and' ? 'All' : 'Any'} of ${node.children.length} conditions`;
}

export async function screenCountsForViewer(input: CountsInput): Promise<ConditionCountsDto> {
  const viewer = await requireViewer();
  assertFilter(input.filter, viewer);
  const universe = await resolveUniverse(input.universe, viewer);
  const session = await resolveSession(input.asOf);
  const conditions = topLevelConditions(input.filter);
  if (session.tradingDate === null) {
    return { base: 0, labels: conditions.map(conditionLabel), individual: [], cumulative: [] };
  }
  const counts = await conditionCounts(getDatabase(), {
    tradingDate: session.tradingDate,
    universe,
    conditions,
  });
  return { ...counts, labels: conditions.map(conditionLabel) };
}

// ---------------------------------------------------------------------------
// Presets (config/screener-presets.yaml)
// ---------------------------------------------------------------------------

const presetFileSchema = z.object({
  presets: z.array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9-]{2,60}$/),
        group: z.string().min(1).max(40),
        label: z.string().min(1).max(80),
        description: z.string().min(1).max(300),
        sort: sortSchema,
        filter: filterNodeSchema,
      })
      .strict(),
  ),
});

function configDir(): string {
  const fromApp = join(process.cwd(), '..', '..', 'config');
  return existsSync(join(fromApp, 'screener-presets.yaml'))
    ? fromApp
    : join(process.cwd(), 'config');
}

let presetCache: { at: number; presets: PresetDto[] } | null = null;

/**
 * Presets, validated against the catalogue as non-admin screens: a preset
 * that names an admin-only metric or breaks a unit rule fails loudly here
 * rather than appearing to users as a broken chip.
 */
export async function loadPresets(): Promise<PresetDto[]> {
  if (presetCache !== null && Date.now() - presetCache.at < 5 * 60_000) return presetCache.presets;
  const raw = await readFile(join(configDir(), 'screener-presets.yaml'), 'utf8');
  const parsed = presetFileSchema.parse(parse(raw));
  const presets = parsed.presets.map((p) => {
    const problems = validateFilter(p.filter, { isAdmin: false });
    if (problems.length > 0) throw new Error(`screener preset "${p.id}": ${problems.join(' ')}`);
    return p;
  });
  presetCache = { at: Date.now(), presets };
  return presets;
}

export async function getScreenerMeta(): Promise<ScreenerMetaDto> {
  const viewer = await requireViewer();
  const db = getDatabase();
  const [latest, presets, watchlists, sessions] = await Promise.all([
    latestSnapshotBuild(db),
    loadPresets(),
    listWatchlists(db, viewer.userId),
    snapshotDates(db, 60),
  ]);
  const industries = latest === null ? [] : await snapshotIndustries(db, latest.tradingDate);
  const metrics = catalogueFor(viewer.isAdmin).map((d) => ({
    key: d.key,
    label: d.label,
    category: d.category,
    unit: d.unit,
    description: d.description,
    decimals: d.decimals ?? null,
    options:
      d.key === 'industry' ? industries.map((v) => ({ value: v, label: v })) : (d.options ?? null),
  }));
  const categories = METRIC_CATEGORIES.filter((c) => metrics.some((m) => m.category === c)).map(
    (c) => ({ key: c, label: CATEGORY_LABELS[c] }),
  );
  return {
    isAdmin: viewer.isAdmin,
    metrics,
    categories,
    presets,
    industries,
    sessions,
    latest:
      latest === null
        ? null
        : { tradingDate: latest.tradingDate, builtAt: latest.finishedAt?.toISOString() ?? null },
    watchlists: watchlists.map((w) => ({ id: w.id, name: w.name })),
    indices: INDEX_OPTIONS,
    defaultColumns: DEFAULT_COLUMNS,
  };
}

// ---------------------------------------------------------------------------
// Saved screens
// ---------------------------------------------------------------------------

function toSavedDto(row: SavedScreenRow): SavedScreenDto | null {
  // Validated on read as well as write: a catalogue change can retire a metric.
  const filter = filterNodeSchema.safeParse(row.definition);
  const columns = z.array(z.string()).safeParse(row.columns);
  if (!filter.success || !columns.success) return null;
  return {
    id: row.id,
    name: row.name,
    filter: filter.data,
    columns: columns.data.filter(isMetricKey),
    sort: row.sort,
    universe: row.universe,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSavedScreens(): Promise<SavedScreenDto[]> {
  const viewer = await requireViewer();
  const rows = await listSavedScreens(getDatabase(), viewer.userId);
  return rows.flatMap((r) => {
    const dto = toSavedDto(r);
    return dto === null ? [] : [dto];
  });
}

export async function saveScreen(body: SavedScreenBody): Promise<SavedScreenDto> {
  const viewer = await requireViewer();
  assertFilter(body.filter, viewer);
  parseSort(body.sort, viewer);
  await resolveUniverse(body.universe, viewer);
  const db = getDatabase();
  if ((await countSavedScreens(db, viewer.userId)) >= MAX_SAVED_SCREENS) {
    throw invalid(`You can keep up to ${MAX_SAVED_SCREENS} saved screens.`, 'TOO_MANY_SCREENS');
  }
  const row = await createSavedScreen(db, viewer.userId, {
    name: body.name,
    definition: body.filter,
    columns: body.columns,
    sort: body.sort,
    universe: body.universe,
  }).catch(rethrowDuplicate);
  const dto = toSavedDto(row);
  if (dto === null) throw new Error('screener: saved screen failed to round-trip');
  return dto;
}

export async function patchScreen(
  id: number,
  body: { [K in keyof SavedScreenBody]?: SavedScreenBody[K] | undefined },
): Promise<SavedScreenDto | null> {
  const viewer = await requireViewer();
  if (body.filter !== undefined) assertFilter(body.filter, viewer);
  if (body.sort !== undefined) parseSort(body.sort, viewer);
  if (body.universe !== undefined) await resolveUniverse(body.universe, viewer);
  const row = await updateSavedScreen(getDatabase(), viewer.userId, id, {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.filter === undefined ? {} : { definition: body.filter }),
    ...(body.columns === undefined ? {} : { columns: body.columns }),
    ...(body.sort === undefined ? {} : { sort: body.sort }),
    ...(body.universe === undefined ? {} : { universe: body.universe }),
  }).catch(rethrowDuplicate);
  return row === null ? null : toSavedDto(row);
}

/** A second screen with the same name is the user's to fix, not a fault. */
function rethrowDuplicate(error: unknown): never {
  const code =
    typeof error === 'object' && error !== null && 'cause' in error
      ? (error.cause as { code?: string } | undefined)?.code
      : (error as { code?: string } | null)?.code;
  if (code === '23505' || (error as { code?: string } | null)?.code === '23505') {
    throw new MarketDataError('You already have a screen with that name.', {
      code: 'DUPLICATE_NAME',
      status: 409,
      remedy: 'Pick a different name.',
    });
  }
  throw error;
}

export async function removeScreen(id: number): Promise<boolean> {
  const viewer = await requireViewer();
  return deleteSavedScreen(getDatabase(), viewer.userId, id);
}
