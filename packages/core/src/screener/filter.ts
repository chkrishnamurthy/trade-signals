import { formatPaise } from '@equitywise/shared';
import {
  isMetricKey,
  type MetricDefinition,
  type MetricKey,
  metricDefinition,
  NUMERIC_UNITS,
} from './catalogue.js';

/**
 * The screener's filter language (plan §5.1): a small, serialisable tree.
 *
 * One definition powers the builder UI, the URL, the SQL compiler and the
 * "matched because …" explanation, so a screen means the same thing
 * everywhere. Values are in STORED units (prices in paise).
 *
 * Semantics that are easy to get wrong, stated once:
 *   - A null metric never matches anything — not `<`, not `is false`. Unknown
 *     is not small, and it is not "no".
 *   - `within N` (sessions/days metrics) means 0 ≤ value ≤ N.
 *   - `in` on a list metric means "shares at least one value".
 */

export type Comparator = 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'within' | 'is' | 'in';

export type FilterValue = number | readonly [number, number] | boolean | string | readonly string[];

export interface FilterLeaf {
  readonly metric: MetricKey;
  readonly cmp: Comparator;
  readonly value?: FilterValue;
  /** Compare against another metric instead of a constant (same unit only). */
  readonly rhsMetric?: MetricKey;
}

export interface FilterGroup {
  readonly op: 'and' | 'or';
  readonly children: readonly FilterNode[];
}

export type FilterNode = FilterGroup | FilterLeaf;

export const FILTER_LIMITS = { depth: 3, leaves: 25 } as const;

export function isGroup(node: FilterNode): node is FilterGroup {
  return 'op' in node;
}

/** Every leaf, depth-first, in authoring order. */
export function leavesOf(node: FilterNode): FilterLeaf[] {
  return isGroup(node) ? node.children.flatMap(leavesOf) : [node];
}

/** A value the evaluator reads: a snapshot row keyed by metric. */
export type MetricRow = Readonly<Partial<Record<MetricKey, unknown>>>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Semantic checks the shape validator (Zod, at the API boundary) cannot do:
 * known metrics, comparators legal for the unit, option values that exist,
 * admin-only metrics for admins only, and the size limits.
 *
 * @returns human-readable problems; empty means valid.
 */
export function validateFilter(node: FilterNode, options: { isAdmin: boolean }): string[] {
  const problems: string[] = [];
  let leaves = 0;

  const visit = (n: FilterNode, depth: number): void => {
    if (depth > FILTER_LIMITS.depth) {
      problems.push(`Groups may nest at most ${FILTER_LIMITS.depth} deep.`);
      return;
    }
    if (isGroup(n)) {
      if (n.children.length === 0) problems.push('A group needs at least one condition.');
      for (const child of n.children) visit(child, depth + 1);
      return;
    }
    leaves += 1;
    problems.push(...validateLeaf(n, options.isAdmin));
  };
  visit(node, 1);

  if (leaves > FILTER_LIMITS.leaves) {
    problems.push(`A screen may have at most ${FILTER_LIMITS.leaves} conditions.`);
  }
  return problems;
}

function validateLeaf(leaf: FilterLeaf, isAdmin: boolean): string[] {
  if (!isMetricKey(leaf.metric)) return [`Unknown metric "${String(leaf.metric)}".`];
  const def = metricDefinition(leaf.metric);
  if (def.adminOnly === true && !isAdmin) return [`Unknown metric "${leaf.metric}".`];
  const name = def.label;
  const v = leaf.value;

  if (leaf.rhsMetric !== undefined) {
    if (!isMetricKey(leaf.rhsMetric)) return [`Unknown metric "${String(leaf.rhsMetric)}".`];
    const rhs = metricDefinition(leaf.rhsMetric);
    if (rhs.adminOnly === true && !isAdmin) return [`Unknown metric "${leaf.rhsMetric}".`];
    if (!['gt', 'gte', 'lt', 'lte'].includes(leaf.cmp))
      return [`${name}: only >, ≥, <, ≤ can compare two metrics.`];
    if (!NUMERIC_UNITS.has(def.unit) || rhs.unit !== def.unit)
      return [`${name} and ${rhs.label} are in different units and cannot be compared.`];
    return [];
  }

  if (NUMERIC_UNITS.has(def.unit)) {
    if (['gt', 'gte', 'lt', 'lte'].includes(leaf.cmp)) {
      return isFiniteNumber(v) ? [] : [`${name}: enter a number.`];
    }
    if (leaf.cmp === 'between') {
      return isRange(v) ? [] : [`${name}: enter a low and a high value, low first.`];
    }
    if (leaf.cmp === 'within' && (def.unit === 'sessions' || def.unit === 'days')) {
      return isFiniteNumber(v) && Number.isInteger(v) && v >= 0
        ? []
        : [`${name}: "within" needs a whole number of ${def.unit}.`];
    }
    return [`${name}: that comparison does not apply to a number.`];
  }

  if (def.unit === 'boolean') {
    return leaf.cmp === 'is' && typeof v === 'boolean' ? [] : [`${name}: choose yes or no.`];
  }

  if (def.unit === 'enum' || def.unit === 'text') {
    const allowed = def.unit === 'enum' ? new Set((def.options ?? []).map((o) => o.value)) : null;
    const ok = (s: unknown): boolean =>
      typeof s === 'string' && s.length > 0 && s.length <= 80 && (allowed === null || allowed.has(s));
    if (leaf.cmp === 'is') return ok(v) ? [] : [`${name}: choose a valid option.`];
    if (leaf.cmp === 'in')
      return Array.isArray(v) && v.length > 0 && v.length <= 50 && v.every(ok)
        ? []
        : [`${name}: choose at least one valid option.`];
    return [`${name}: use "is" or "is any of".`];
  }

  if (def.unit === 'list') {
    const allowed = new Set((def.options ?? []).map((o) => o.value));
    return leaf.cmp === 'in' &&
      Array.isArray(v) &&
      v.length > 0 &&
      v.every((s) => typeof s === 'string' && allowed.has(s))
      ? []
      : [`${name}: choose at least one valid option.`];
  }

  return [`${name}: unsupported condition.`];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isRange(v: unknown): v is readonly [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    isFiniteNumber(v[0]) &&
    isFiniteNumber(v[1]) &&
    (v[0] as number) <= (v[1] as number)
  );
}

// ---------------------------------------------------------------------------
// Evaluation (the "why matched" path; the SQL compiler is the fast path)
// ---------------------------------------------------------------------------

export function evaluateFilter(node: FilterNode, row: MetricRow): boolean {
  if (isGroup(node)) {
    return node.op === 'and'
      ? node.children.every((c) => evaluateFilter(c, row))
      : node.children.some((c) => evaluateFilter(c, row));
  }
  return evaluateLeaf(node, row);
}

export function evaluateLeaf(leaf: FilterLeaf, row: MetricRow): boolean {
  const lhs = row[leaf.metric];
  if (lhs === null || lhs === undefined) return false;

  if (leaf.rhsMetric !== undefined) {
    const rhs = row[leaf.rhsMetric];
    if (typeof lhs !== 'number' || typeof rhs !== 'number') return false;
    return compare(lhs, leaf.cmp, rhs);
  }

  const v = leaf.value;
  switch (leaf.cmp) {
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return typeof lhs === 'number' && typeof v === 'number' && compare(lhs, leaf.cmp, v);
    case 'between':
      return typeof lhs === 'number' && isRange(v) && lhs >= v[0] && lhs <= v[1];
    case 'within':
      return typeof lhs === 'number' && typeof v === 'number' && lhs >= 0 && lhs <= v;
    case 'is':
      return lhs === v;
    case 'in': {
      if (!Array.isArray(v)) return false;
      if (Array.isArray(lhs)) return lhs.some((x) => v.includes(x));
      return typeof lhs === 'string' && v.includes(lhs);
    }
    default:
      return false;
  }
}

function compare(a: number, cmp: Comparator, b: number): boolean {
  if (cmp === 'gt') return a > b;
  if (cmp === 'gte') return a >= b;
  if (cmp === 'lt') return a < b;
  if (cmp === 'lte') return a <= b;
  return false;
}

// ---------------------------------------------------------------------------
// Plain-language descriptions
// ---------------------------------------------------------------------------

const SYMBOLS: Readonly<Record<string, string>> = { gt: '>', gte: '≥', lt: '<', lte: '≤' };

/** A value in the metric's unit, for labels: `₹1,245.50`, `12.5%`, `2.0×`, `3 pp`. */
export function formatMetricValue(def: MetricDefinition, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((v) => optionLabel(def, String(v))).join(', ');
  if (typeof value === 'string') return optionLabel(def, value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const d = def.decimals ?? 2;
  switch (def.unit) {
    case 'paise':
      return Number.isInteger(value) ? formatPaise(value, { decimals: d >= 2 ? 2 : 0 }) : '—';
    case 'percent':
      return `${value.toFixed(d)}%`;
    case 'pp':
      return `${value.toFixed(d)} pp`;
    case 'multiple':
      return `${value.toFixed(d)}×`;
    case 'sessions':
      return `${value} session${value === 1 ? '' : 's'}`;
    case 'days':
      return `${value} day${value === 1 ? '' : 's'}`;
    default:
      return value.toLocaleString('en-IN', { maximumFractionDigits: d });
  }
}

function optionLabel(def: MetricDefinition, value: string): string {
  return def.options?.find((o) => o.value === value)?.label ?? value;
}

/** "RSI (14) ≥ 60", "EMA stack is Bullish", "RSI crossed above 60 within 3 sessions". */
export function describeLeaf(leaf: FilterLeaf): string {
  if (!isMetricKey(leaf.metric)) return String(leaf.metric);
  const def = metricDefinition(leaf.metric);
  if (leaf.rhsMetric !== undefined && isMetricKey(leaf.rhsMetric)) {
    return `${def.label} ${SYMBOLS[leaf.cmp] ?? leaf.cmp} ${metricDefinition(leaf.rhsMetric).label}`;
  }
  const v = leaf.value;
  switch (leaf.cmp) {
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return `${def.label} ${SYMBOLS[leaf.cmp]} ${formatMetricValue(def, v)}`;
    case 'between':
      return isRange(v)
        ? `${def.label} between ${formatMetricValue(def, v[0])} and ${formatMetricValue(def, v[1])}`
        : def.label;
    case 'within':
      return `${def.label} within ${formatMetricValue(def, v)}`;
    case 'is':
      return def.unit === 'boolean'
        ? v === true
          ? def.label
          : `Not: ${def.label}`
        : `${def.label} is ${formatMetricValue(def, v)}`;
    case 'in':
      return `${def.label} is any of ${formatMetricValue(def, v)}`;
    default:
      return def.label;
  }
}

/**
 * The conditions a row satisfied, with its actual values — the stock page's
 * "Matched because" banner. OR groups contribute only the branches that held.
 */
export function explainMatch(node: FilterNode, row: MetricRow): string[] {
  if (isGroup(node)) {
    return node.children.flatMap((c) => (evaluateFilter(c, row) ? explainMatch(c, row) : []));
  }
  if (!evaluateLeaf(node, row)) return [];
  const def = metricDefinition(node.metric);
  if (def.unit === 'boolean' || node.cmp === 'is' || node.cmp === 'in') return [describeLeaf(node)];
  const actual = formatMetricValue(def, row[node.metric]);
  return [`${describeLeaf(node)} (${actual})`];
}
