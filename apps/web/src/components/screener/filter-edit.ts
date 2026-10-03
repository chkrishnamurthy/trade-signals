import type { Comparator, FilterGroup, FilterLeaf, FilterNode, MetricKey } from '@equitywise/core';
import type { MetricDto } from '@/lib/screener-types';

/**
 * Pure helpers for editing a filter tree in the builder. The tree is always
 * edited as a root GROUP; a preset that is a single leaf is wrapped on load.
 */

export const NUMERIC = new Set([
  'paise',
  'percent',
  'pp',
  'ratio',
  'multiple',
  'count',
  'shares',
  'score',
  'sessions',
  'days',
]);

export const COMPARATOR_LABELS: Readonly<Record<Comparator, string>> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: 'between',
  within: 'within',
  is: 'is',
  in: 'is any of',
};

export function comparatorsFor(metric: MetricDto): Comparator[] {
  if (metric.unit === 'sessions' || metric.unit === 'days') return ['within', 'lte', 'gte', 'between'];
  if (NUMERIC.has(metric.unit)) return ['gte', 'gt', 'lte', 'lt', 'between'];
  if (metric.unit === 'boolean') return ['is'];
  if (metric.unit === 'enum') return ['is', 'in'];
  return ['in'];
}

/** A sensible starting condition for a freshly picked metric. */
export function defaultLeaf(metric: MetricDto): FilterLeaf {
  const key = metric.key as MetricKey;
  const first = metric.options?.[0]?.value ?? '';
  switch (metric.unit) {
    case 'sessions':
    case 'days':
      return { metric: key, cmp: 'within', value: 5 };
    case 'boolean':
      return { metric: key, cmp: 'is', value: true };
    case 'enum':
      return { metric: key, cmp: 'is', value: first };
    case 'text':
      return { metric: key, cmp: 'in', value: first === '' ? [] : [first] };
    case 'list':
      return { metric: key, cmp: 'in', value: ['nifty500'] };
    case 'multiple':
      return { metric: key, cmp: 'gte', value: 1.5 };
    case 'score':
      return { metric: key, cmp: 'gte', value: key === 'rsRank' ? 70 : 50 };
    case 'paise':
      return { metric: key, cmp: 'gte', value: 10_000 };
    default:
      return { metric: key, cmp: 'gt', value: 0 };
  }
}

/** Keeps a leaf's value coherent when its comparator changes. */
export function withComparator(leaf: FilterLeaf, cmp: Comparator, metric: MetricDto): FilterLeaf {
  const v = leaf.value;
  if (cmp === 'between') {
    const base = typeof v === 'number' ? v : 0;
    return { metric: leaf.metric, cmp, value: [base, base + (metric.unit === 'paise' ? 10_000 : 10)] };
  }
  if (cmp === 'in') {
    return { metric: leaf.metric, cmp, value: typeof v === 'string' ? [v] : Array.isArray(v) ? v : [] };
  }
  if (cmp === 'is' && metric.unit === 'enum') {
    const first = Array.isArray(v) ? v[0] : v;
    return { metric: leaf.metric, cmp, value: typeof first === 'string' ? first : (metric.options?.[0]?.value ?? '') };
  }
  const n = Array.isArray(v) ? (typeof v[0] === 'number' ? v[0] : 0) : typeof v === 'number' ? v : 0;
  return { metric: leaf.metric, cmp, value: n };
}

export function asGroup(node: FilterNode | null): FilterGroup {
  if (node === null) return { op: 'and', children: [] };
  return 'op' in node ? node : { op: 'and', children: [node] };
}

/** An empty root group means "no filter". */
export function toFilter(group: FilterGroup): FilterNode | null {
  const children = group.children.filter((c) => !('op' in c) || c.children.length > 0);
  return children.length === 0 ? null : { op: group.op, children };
}

export function replaceAt(group: FilterGroup, index: number, node: FilterNode | null): FilterGroup {
  const children = [...group.children];
  if (node === null) children.splice(index, 1);
  else children[index] = node;
  return { op: group.op, children };
}

export function leafCount(node: FilterNode | null): number {
  if (node === null) return 0;
  return 'op' in node ? node.children.reduce((n, c) => n + leafCount(c), 0) : 1;
}
