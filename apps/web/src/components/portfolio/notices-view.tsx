'use client';

import { BellIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
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
} from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { NoticeSettingsDto, PortfolioNoticesDto } from '@/lib/portfolio-types';
import { cn } from '@/lib/utils';
import { noticeText } from './notice-text';
import { longDate } from './portfolio-client';
import { PortfolioNav } from './portfolio-nav';

/**
 * Notices about the user's own holdings (phase 6.2): dividends and share
 * changes coming up, a split or bonus applied, a large daily move, a purchase
 * turning long term. In the app only. Opening the page marks them read; the
 * ones that were new stay marked "New" until the page is left.
 */

export const NOTICES_READ_EVENT = 'equitywise:notices-read';

function SettingRow({
  id,
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {children !== undefined && checked && <div className="mt-2">{children}</div>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

function NumberField({
  id,
  label,
  context,
  value,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  /** Read out before the visible label, so each field has its own name. */
  context: string;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        <span className="sr-only">{context}: </span>
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        className="h-8 w-20 tabular-nums"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <span className="text-muted-foreground">{suffix}</span>
    </div>
  );
}

function Settings({ initial }: { initial: NoticeSettingsDto }) {
  const [s, setS] = React.useState(initial);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof NoticeSettingsDto>(key: K, value: NoticeSettingsDto[K]) => {
    setS((cur) => ({ ...cur, [key]: value }));
    setStatus(null);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/portfolio/notices/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(s),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus(
        res.ok
          ? { ok: true, text: 'Saved. New notices follow these choices from tonight.' }
          : { ok: false, text: payload.error ?? 'Could not save. Try again.' },
      );
    } catch {
      setStatus({ ok: false, text: 'Could not save. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={save}
      aria-labelledby="notice-settings-h"
      className="flex flex-col rounded-lg border border-border bg-surface p-4 shadow-subtle"
    >
      <h2 id="notice-settings-h" className="text-sm font-semibold">
        Which notices you get
      </h2>
      <p className="text-xs text-muted-foreground">
        Shown here in the app, checked each weekday evening after the market closes.
      </p>
      <div className="mt-2 divide-y divide-border">
        <SettingRow
          id="n-events"
          label="Coming up"
          hint="A dividend ex-date, bonus, split, results or board meeting within 3 days."
          checked={s.events}
          onChange={(v) => set('events', v)}
        />
        <SettingRow
          id="n-changes"
          label="Split or bonus applied"
          hint="When a split, bonus or consolidation takes effect, with your new share count."
          checked={s.shareChanges}
          onChange={(v) => set('shareChanges', v)}
        />
        <SettingRow
          id="n-stock"
          label="Large move in a stock"
          hint="A stock you hold closed up or down by at least this much in a day."
          checked={s.stockMoves}
          onChange={(v) => set('stockMoves', v)}
        >
          <NumberField
            id="n-stock-pct"
            label="At least"
            context="Large move in a stock"
            value={s.stockMovePercent}
            suffix="%"
            onChange={(v) => set('stockMovePercent', v)}
          />
        </SettingRow>
        <SettingRow
          id="n-portfolio"
          label="Large move in your holdings"
          hint="All your holdings together closed up or down by at least this much in a day."
          checked={s.portfolioMoves}
          onChange={(v) => set('portfolioMoves', v)}
        >
          <NumberField
            id="n-portfolio-pct"
            label="At least"
            context="Large move in your holdings"
            value={s.portfolioMovePercent}
            suffix="%"
            onChange={(v) => set('portfolioMovePercent', v)}
          />
        </SettingRow>
        <SettingRow
          id="n-long"
          label="Turning long term"
          hint="Shares you hold pass 12 months, for information."
          checked={s.longTerm}
          onChange={(v) => set('longTerm', v)}
        >
          <NumberField
            id="n-long-days"
            label="Tell me"
            context="Turning long term"
            value={s.longTermDays}
            suffix="days ahead"
            onChange={(v) => set('longTermDays', v)}
          />
        </SettingRow>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save choices'}
        </Button>
        {status !== null && (
          <p
            role={status.ok ? 'status' : 'alert'}
            className={cn('text-sm', status.ok ? 'text-muted-foreground' : 'text-destructive')}
          >
            {status.text}
          </p>
        )}
      </div>
    </form>
  );
}

export function NoticesView({ data }: { data: PortfolioNoticesDto }) {
  // What was new when the page opened stays marked "New" while it is open.
  const [fresh] = React.useState(
    () => new Set(data.notices.filter((n) => !n.read).map((n) => n.id)),
  );
  React.useEffect(() => {
    if (fresh.size === 0) return;
    fetch('/api/portfolio/notices/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(() => window.dispatchEvent(new Event(NOTICES_READ_EVENT)))
      .catch(() => undefined);
  }, [fresh]);

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Notices</PageTitle>
            <PageDescription>
              What happened, or is coming up, for the stocks you hold. Facts about your own shares,
              not suggestions.
            </PageDescription>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <PortfolioNav current="notices" />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section
              aria-labelledby="notices-h"
              className="flex min-w-0 flex-col rounded-lg border border-border bg-surface shadow-subtle"
            >
              <h2 id="notices-h" className="sr-only">
                Your notices
              </h2>
              {data.notices.length === 0 ? (
                <EmptyState
                  icon={<BellIcon />}
                  title="No notices yet"
                  description="Each weekday evening, after the market closes, the stocks you hold are checked for anything coming up or a large move. Notices appear here."
                />
              ) : (
                <ol className="divide-y divide-border">
                  {data.notices.map((n) => {
                    const t = noticeText(n);
                    const isNew = fresh.has(n.id);
                    return (
                      <li key={n.id} className="flex gap-3 px-4 py-3">
                        <span
                          aria-hidden
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            isNew ? 'bg-primary' : 'bg-transparent',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <h3 className={cn('text-sm', isNew ? 'font-semibold' : 'font-medium')}>
                              {t.title}
                            </h3>
                            {isNew && <Badge variant="neutral">New</Badge>}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{t.body}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            <span>Noted {longDate(n.createdAt.slice(0, 10))}</span>
                            {t.symbol !== null && (
                              <Link
                                href={`/portfolio/${encodeURIComponent(t.symbol)}` as Route}
                                className="underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                              >
                                Your {t.symbol} holding
                              </Link>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            <Settings initial={data.settings} />
          </div>
          <p className="text-xs text-muted-foreground">
            Notices describe your own numbers and the exchange&apos;s records. They are not a
            recommendation, and EquityWise is not a SEBI-registered adviser.
          </p>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
