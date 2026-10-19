'use client';

import { formatPaise, rupeesToPaise } from '@equitywise/shared';
import { BellIcon, CheckCheckIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
} from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { AlertDto, AlertEventDto, AlertsOverviewDto } from '@/lib/alert-types';

type Metric = AlertDto['metric'];
type Comparator = AlertDto['comparator'];

const METRIC_LABEL: Record<Metric, string> = { close: 'Closing price', rsi14: 'RSI (14)' };
const DIRECTION_LABEL: Record<Comparator, string> = {
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
};

/** "Closing price crosses above ₹1,500.00" — a condition, never an instruction. */
export function describeRule(rule: Pick<AlertDto, 'metric' | 'comparator' | 'threshold'>): string {
  const level = rule.metric === 'close' ? formatPaise(rule.threshold) : String(rule.threshold);
  return `${METRIC_LABEL[rule.metric]} ${DIRECTION_LABEL[rule.comparator]} ${level}`;
}

/** Turns what the person typed into the API's level: paise for a price, the number for RSI. */
function parseLevel(metric: Metric, text: string): { ok: true; level: number } | { ok: false } {
  const trimmed = text.trim().replace(/,/g, '');
  if (trimmed === '') return { ok: false };
  try {
    if (metric === 'close') return { ok: true, level: rupeesToPaise(trimmed) };
    const value = Number(trimmed);
    return Number.isFinite(value) ? { ok: true, level: value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

async function send(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const init: RequestInit =
      body === undefined
        ? { method }
        : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const response = await fetch(url, init);
    if (response.ok) return { ok: true };
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      remedy?: string;
    } | null;
    return {
      ok: false,
      message:
        [payload?.error, payload?.remedy].filter(Boolean).join(' ') || 'Something went wrong.',
    };
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection.' };
  }
}

export function AlertsView({ overview }: { overview: AlertsOverviewDto }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const run = (action: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  };

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Alerts</PageTitle>
            <PageDescription>
              Get told when a stock crosses a closing-price or RSI level. Alerts are checked once
              each trading day, after the session closes, and sent by email as well as shown here.
              They state that a condition was met and nothing more.
            </PageDescription>
          </PageHeading>
        </PageHeader>

        <PageContent>
          {error !== null && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <CreateForm
            count={overview.alerts.length}
            limit={overview.limit}
            disabled={pending}
            onCreate={(body) => run(() => send('/api/alerts', 'POST', body))}
          />

          <Section aria-labelledby="alerts-rules" className="flex flex-col gap-3">
            <h2 id="alerts-rules" className="text-sm font-semibold">
              Your alerts ({overview.alerts.length} of {overview.limit})
            </h2>
            {overview.alerts.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface shadow-subtle">
                <EmptyState
                  icon={<BellIcon />}
                  title="No alerts yet"
                  description="Add one above, for example RELIANCE closing price crosses above a level."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface shadow-subtle">
                {overview.alerts.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    disabled={pending}
                    onToggle={(enabled) =>
                      run(() => send(`/api/alerts/${rule.id}`, 'PATCH', { enabled }))
                    }
                    onDelete={() => run(() => send(`/api/alerts/${rule.id}`, 'DELETE'))}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section aria-labelledby="alerts-events" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="alerts-events" className="text-sm font-semibold">
                Recent alerts
                {overview.unacknowledged > 0 && (
                  <Badge className="ml-2">{overview.unacknowledged} new</Badge>
                )}
              </h2>
              {overview.unacknowledged > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => send('/api/alerts/acknowledge', 'POST'))}
                >
                  <CheckCheckIcon /> Mark all seen
                </Button>
              )}
            </div>
            {overview.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing has fired yet. Alerts are checked after each close.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface shadow-subtle">
                {overview.events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </Section>

          <p className="text-xs text-muted-foreground">
            Alerts describe the closing numbers of a completed session. They are not recommendations
            and EquityWise is not a SEBI-registered adviser.
          </p>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function CreateForm({
  count,
  limit,
  disabled,
  onCreate,
}: {
  count: number;
  limit: number;
  disabled: boolean;
  onCreate: (body: {
    symbol: string;
    metric: Metric;
    comparator: Comparator;
    level: number;
    oneShot: boolean;
  }) => void;
}) {
  const [symbol, setSymbol] = React.useState('');
  const [metric, setMetric] = React.useState<Metric>('close');
  const [comparator, setComparator] = React.useState<Comparator>('crosses_above');
  const [levelText, setLevelText] = React.useState('');
  const [oneShot, setOneShot] = React.useState(true);
  const [problem, setProblem] = React.useState<string | null>(null);
  const atLimit = count >= limit;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseLevel(metric, levelText);
    if (symbol.trim() === '') return setProblem('Enter a stock symbol, for example RELIANCE.');
    if (!parsed.ok)
      return setProblem(
        metric === 'close'
          ? 'Enter the price in rupees, for example 1500.'
          : 'Enter an RSI between 1 and 99.',
      );
    setProblem(null);
    onCreate({ symbol: symbol.trim(), metric, comparator, level: parsed.level, oneShot });
    setLevelText('');
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-subtle sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="alert-symbol">Stock symbol</Label>
        <Input
          id="alert-symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="RELIANCE"
          autoCapitalize="characters"
          autoComplete="off"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="alert-metric">Measure</Label>
        <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <SelectTrigger id="alert-metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="close">Closing price</SelectItem>
            <SelectItem value="rsi14">RSI (14)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="alert-direction">Condition</Label>
        <Select value={comparator} onValueChange={(v) => setComparator(v as Comparator)}>
          <SelectTrigger id="alert-direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="crosses_above">Crosses above</SelectItem>
            <SelectItem value="crosses_below">Crosses below</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="alert-level">{metric === 'close' ? 'Level (₹)' : 'Level (1–99)'}</Label>
        <Input
          id="alert-level"
          value={levelText}
          onChange={(e) => setLevelText(e.target.value)}
          inputMode="decimal"
          placeholder={metric === 'close' ? '1500' : '70'}
          autoComplete="off"
        />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={disabled || atLimit} className="w-full lg:w-auto">
          Add alert
        </Button>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
        <Switch id="alert-oneshot" checked={oneShot} onCheckedChange={setOneShot} />
        <Label htmlFor="alert-oneshot" className="text-sm font-normal text-muted-foreground">
          Switch this alert off after it fires once
        </Label>
      </div>
      {(problem !== null || atLimit) && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-5">
          {atLimit
            ? `You have reached the limit of ${limit} alerts. Delete one to add another.`
            : problem}
        </p>
      )}
    </form>
  );
}

function RuleRow({
  rule,
  disabled,
  onToggle,
  onDelete,
}: {
  rule: AlertDto;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {rule.symbol} <span className="font-normal text-muted-foreground">· {rule.name}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {describeRule(rule)}
          {rule.oneShot ? ' · once' : ' · every crossing'}
        </p>
        {rule.lastTriggeredAt !== null && (
          <p className="text-xs text-subtle-foreground">
            Last fired {new Date(rule.lastTriggeredAt).toLocaleDateString('en-IN')}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Label
          htmlFor={`alert-on-${rule.id}`}
          className="text-xs font-normal text-muted-foreground"
        >
          {rule.enabled ? 'On' : 'Off'}
        </Label>
        <Switch
          id={`alert-on-${rule.id}`}
          checked={rule.enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
          aria-label={`Alert on ${rule.symbol}`}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={onDelete}
          aria-label={`Delete alert on ${rule.symbol}`}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}

function EventRow({ event }: { event: AlertEventDto }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden
        className={`mt-1.5 size-2 shrink-0 rounded-full ${event.acknowledged ? 'bg-border' : 'bg-primary'}`}
      />
      <div className="min-w-0">
        <p className="text-sm">{event.message}</p>
        <p className="text-xs text-subtle-foreground">
          Session of {event.tradingDate}
          {event.acknowledged ? '' : ' · new'}
        </p>
      </div>
    </li>
  );
}
