'use client';

import type { Comparator, FilterGroup, FilterLeaf, FilterNode } from '@equitywise/core';
import { ChevronDownIcon, ListPlusIcon, PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { unitHint } from '@/lib/screener-format';
import type { MetricDto } from '@/lib/screener-types';
import { cn } from '@/lib/utils';
import {
  COMPARATOR_LABELS,
  comparatorsFor,
  defaultLeaf,
  replaceAt,
  withComparator,
} from './filter-edit';
import { MetricPicker } from './metric-picker';

/**
 * The filter builder (plan §5.1, §8.2): ALL/ANY at the root, one level of
 * nested groups, and rows of metric · comparator · value. Each top-level row
 * shows how many stocks it keeps on its own, so the user can see which
 * condition is doing the narrowing.
 */

interface Ctx {
  readonly metrics: ReadonlyMap<string, MetricDto>;
  readonly metricList: readonly MetricDto[];
  readonly categories: readonly { key: string; label: string }[];
}

export function FilterBuilder({
  group,
  onChange,
  metrics,
  categories,
  counts,
}: {
  group: FilterGroup;
  onChange: (next: FilterGroup) => void;
  metrics: readonly MetricDto[];
  categories: readonly { key: string; label: string }[];
  /** Matches per top-level condition (same order), when known. */
  counts: readonly (number | undefined)[] | null;
}) {
  const ctx: Ctx = {
    metrics: new Map(metrics.map((m) => [m.key, m])),
    metricList: metrics,
    categories,
  };
  const add = (key: string) => {
    const metric = ctx.metrics.get(key);
    if (metric === undefined) return;
    onChange({ op: group.op, children: [...group.children, defaultLeaf(metric)] });
  };
  const addGroup = () => onChange({ op: group.op, children: [...group.children, { op: 'or', children: [] }] });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">Match</span>
        <OpToggle op={group.op} onChange={(op) => onChange({ op, children: group.children })} />
      </div>

      {group.children.length === 0 && (
        <p className="rounded-lg border border-border border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
          No conditions yet — pick a preset or add one. With none, the screen lists every stock.
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {group.children.map((child, i) => (
          <li key={childKey(child, i)}>
            {'op' in child ? (
              <SubGroup
                group={child}
                ctx={ctx}
                count={counts?.[i]}
                onChange={(next) => onChange(replaceAt(group, i, next))}
              />
            ) : (
              <ConditionRow
                leaf={child}
                ctx={ctx}
                count={counts?.[i]}
                onChange={(next) => onChange(replaceAt(group, i, next))}
              />
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <MetricPicker metrics={ctx.metricList} categories={categories} onSelect={add}>
          <Button variant="outline" className="flex-1 border-dashed">
            <PlusIcon aria-hidden />
            Add condition
          </Button>
        </MetricPicker>
        <Button variant="ghost" onClick={addGroup} title="A group whose conditions are combined the other way">
          <ListPlusIcon aria-hidden />
          Add group
        </Button>
      </div>
    </div>
  );
}

function childKey(node: FilterNode, i: number): string {
  return 'op' in node ? `g${i}` : `${node.metric}-${i}`;
}

function OpToggle({ op, onChange }: { op: 'and' | 'or'; onChange: (op: 'and' | 'or') => void }) {
  return (
    <div role="group" aria-label="Combine conditions" className="inline-flex rounded-md border border-border bg-surface-sunken p-0.5">
      {(['and', 'or'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={op === value}
          onClick={() => onChange(value)}
          className={cn(
            'h-7 cursor-pointer rounded px-2.5 font-medium text-xs',
            op === value ? 'bg-surface text-foreground shadow-subtle' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value === 'and' ? 'ALL of' : 'ANY of'}
        </button>
      ))}
    </div>
  );
}

function SubGroup({
  group,
  ctx,
  count,
  onChange,
}: {
  group: FilterGroup;
  ctx: Ctx;
  count: number | undefined;
  onChange: (next: FilterGroup | null) => void;
}) {
  const add = (key: string) => {
    const metric = ctx.metrics.get(key);
    if (metric !== undefined) onChange({ op: group.op, children: [...group.children, defaultLeaf(metric)] });
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-strong border-dashed bg-surface-sunken p-2.5">
      <div className="flex items-center justify-between gap-2">
        <OpToggle op={group.op} onChange={(op) => onChange({ op, children: group.children })} />
        <div className="flex items-center gap-1">
          <CountLabel count={count} />
          <Button variant="ghost" size="icon-sm" aria-label="Remove group" onClick={() => onChange(null)}>
            <XIcon aria-hidden />
          </Button>
        </div>
      </div>
      {group.children.map((child, i) =>
        'op' in child ? null : (
          <ConditionRow
            key={childKey(child, i)}
            leaf={child}
            ctx={ctx}
            count={undefined}
            onChange={(next) => {
              const updated = replaceAt(group, i, next);
              onChange(updated);
            }}
          />
        ),
      )}
      <MetricPicker metrics={ctx.metricList} categories={ctx.categories} onSelect={add}>
        <Button variant="ghost" size="sm" className="self-start">
          <PlusIcon aria-hidden />
          Add to group
        </Button>
      </MetricPicker>
    </div>
  );
}

function CountLabel({ count }: { count: number | undefined }) {
  if (count === undefined) return null;
  return (
    <span className="figure whitespace-nowrap text-2xs text-muted-foreground">
      {count.toLocaleString('en-IN')} match
    </span>
  );
}

export function ConditionRow({
  leaf,
  ctx,
  count,
  onChange,
}: {
  leaf: FilterLeaf;
  ctx: Ctx;
  count: number | undefined;
  onChange: (next: FilterLeaf | null) => void;
}) {
  const metric = ctx.metrics.get(leaf.metric);
  if (metric === undefined) return null;
  const comparators = comparatorsFor(metric);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1.5 rounded-lg border border-border bg-surface p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <MetricPicker
          metrics={ctx.metricList}
          categories={ctx.categories}
          onSelect={(key) => {
            const next = ctx.metrics.get(key);
            if (next !== undefined) onChange(defaultLeaf(next));
          }}
        >
          <button
            type="button"
            title={metric.description}
            className="inline-flex h-8 max-w-full cursor-pointer items-center gap-1 truncate rounded-md border border-border bg-surface-sunken px-2 font-medium text-sm hover:border-border-strong"
          >
            <span className="truncate">{metric.label}</span>
            <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </MetricPicker>
        {comparators.length > 1 ? (
          <label className="relative">
            <span className="sr-only">Comparison for {metric.label}</span>
            <select
              value={leaf.cmp}
              onChange={(e) => onChange(withComparator(leaf, e.target.value as Comparator, metric))}
              className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-surface px-2 pr-6 font-mono text-sm"
            >
              {comparators.map((c) => (
                <option key={c} value={c}>
                  {COMPARATOR_LABELS[c]}
                </option>
              ))}
            </select>
            <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-2.5 right-1.5 size-3.5 text-muted-foreground" />
          </label>
        ) : (
          <span className="px-1 font-mono text-muted-foreground text-sm">{COMPARATOR_LABELS[leaf.cmp]}</span>
        )}
        <ValueInput leaf={leaf} metric={metric} onChange={onChange} />
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove condition ${metric.label}`}
        onClick={() => onChange(null)}
      >
        <XIcon aria-hidden />
      </Button>
      {count !== undefined && (
        <div className="col-span-2">
          <CountLabel count={count} />
        </div>
      )}
    </div>
  );
}

/** A number in display units; paise metrics are entered in rupees. */
function NumberField({
  value,
  metric,
  label,
  onChange,
}: {
  value: number;
  metric: MetricDto;
  label: string;
  onChange: (stored: number) => void;
}) {
  const isMoney = metric.unit === 'paise';
  const display = isMoney ? value / 100 : value;
  const hint = unitHint(metric);
  return (
    <label className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2 focus-within:outline-2 focus-within:outline-ring">
      <span className="sr-only">{label}</span>
      {isMoney && <span className="text-muted-foreground text-sm">₹</span>}
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={Number.isFinite(display) ? display : ''}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value === '' || !Number.isFinite(n)) return;
          onChange(isMoney ? Math.round(n * 100) : metric.unit === 'sessions' || metric.unit === 'days' ? Math.max(0, Math.round(n)) : n);
        }}
        className="figure w-20 bg-transparent font-semibold text-sm outline-none"
      />
      {!isMoney && hint !== '' && <span className="text-muted-foreground text-xs">{hint}</span>}
    </label>
  );
}

function ValueInput({
  leaf,
  metric,
  onChange,
}: {
  leaf: FilterLeaf;
  metric: MetricDto;
  onChange: (next: FilterLeaf) => void;
}) {
  const v = leaf.value;
  const set = (value: FilterLeaf['value']) =>
    onChange(value === undefined ? { metric: leaf.metric, cmp: leaf.cmp } : { metric: leaf.metric, cmp: leaf.cmp, value });

  if (metric.unit === 'boolean') {
    return (
      <div role="group" aria-label={`${metric.label}: yes or no`} className="inline-flex rounded-md border border-border p-0.5">
        {[true, false].map((b) => (
          <button
            key={String(b)}
            type="button"
            aria-pressed={v === b}
            onClick={() => set(b)}
            className={cn(
              'h-7 cursor-pointer rounded px-2.5 font-medium text-xs',
              v === b ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {b ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    );
  }

  if (leaf.cmp === 'between' && Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number') {
    const lo = v[0] as number;
    const hi = v[1] as number;
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <NumberField value={lo} metric={metric} label={`${metric.label} from`} onChange={(n) => set([n, Math.max(n, hi)])} />
        <span className="text-muted-foreground text-xs">and</span>
        <NumberField value={hi} metric={metric} label={`${metric.label} to`} onChange={(n) => set([Math.min(lo, n), n])} />
      </span>
    );
  }

  if (typeof v === 'number') {
    return <NumberField value={v} metric={metric} label={`${metric.label} value`} onChange={set} />;
  }

  const options = metric.options ?? [];
  if (leaf.cmp === 'is' && typeof v === 'string') {
    return (
      <label className="relative">
        <span className="sr-only">{metric.label} value</span>
        <select
          value={v}
          onChange={(e) => set(e.target.value)}
          className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-surface px-2 pr-6 font-semibold text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-2.5 right-1.5 size-3.5 text-muted-foreground" />
      </label>
    );
  }

  const selected = Array.isArray(v) ? (v as readonly string[]) : [];
  const summary =
    selected.length === 0
      ? 'Choose…'
      : selected.length <= 2
        ? selected.map((s) => options.find((o) => o.value === s)?.label ?? s).join(', ')
        : `${selected.length} selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 max-w-56 cursor-pointer items-center gap-1 truncate rounded-md border border-border bg-surface px-2 font-semibold text-sm"
        >
          <span className="truncate">{summary}</span>
          <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto p-1.5">
        {options.length === 0 && <p className="px-2 py-3 text-muted-foreground text-xs">No values available yet.</p>}
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox
                checked={checked}
                onCheckedChange={(on) =>
                  set(on === true ? [...selected, o.value] : selected.filter((s) => s !== o.value))
                }
              />
              {o.label}
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
