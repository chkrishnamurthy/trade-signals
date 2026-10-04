'use client';

import { StarIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/data-display/states';
import { Currency, Percent, Price, Quantity } from '@/components/market/numeric';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/typography';
import type { StockFlowDetailDto } from '@/lib/disclosure-types';
import { BUILDUP_LABEL, buildupTone, contracts } from '@/lib/flow-labels';
import { largeCurrency } from '@/lib/format';
import {
  ReferenceBars,
  SHARE_LEGEND,
  ShareholdingBars,
  type ShareQuarter,
  TrendLine,
} from './flow-mini-charts';
import { DealTypeBadge, formatDateKey, SideBadge } from './parts';

/**
 * The stock drawer: one name's history across every flow dataset, so a row
 * in the table can be read back to its evidence. Fetched on open from
 * `/api/flows/:symbol`; nothing here recomputes a figure.
 */
export function StockDrawer({ symbol, onClose }: { symbol: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<StockFlowDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (symbol === null) return;
    const controller = new AbortController();
    setDetail(null);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/flows/${encodeURIComponent(symbol)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        const body = (await response.json()) as StockFlowDetailDto | { error?: string };
        if (!response.ok || !('symbol' in body)) {
          setError('error' in body && body.error !== undefined ? body.error : 'Could not load.');
          return;
        }
        setDetail(body);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Could not load.');
      }
    })();
    return () => controller.abort();
  }, [symbol]);

  return (
    <Sheet open={symbol !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader className="flex-col gap-0.5 pr-12">
          <SheetTitle className="flex items-center gap-2">
            {symbol}
            {detail?.onWatchlist && (
              <StarIcon
                aria-label="On your watchlist"
                className="size-4 fill-warning text-warning"
              />
            )}
          </SheetTitle>
          <SheetDescription>{detail?.companyName ?? 'Institutional footprint'}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6">
          {error !== null ? (
            <EmptyState title="Could not load this stock" description={error} />
          ) : detail === null ? (
            <DrawerSkeleton />
          ) : (
            <DrawerBody detail={detail} />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function DrawerBody({ detail }: { detail: StockFlowDetailDto }) {
  const latestDelivery = detail.delivery.at(-1) ?? null;
  const latestOi = detail.oi.at(-1) ?? null;
  const quarters: ShareQuarter[] = detail.shareholding.map((q) => ({
    asOfDate: q.asOfDate,
    segments: [
      { id: 'promoter', label: 'Promoter', percent: q.promoterPercent },
      { id: 'fii', label: 'FII', percent: q.fiiPercent },
      { id: 'dii', label: 'DII', percent: q.diiPercent },
      { id: 'public', label: 'Public', percent: q.publicPercent },
    ],
  }));

  return (
    <>
      <DrawerSection
        title="Delivery"
        detail={
          latestDelivery === null
            ? 'No delivery sessions on file.'
            : `${latestDelivery.percent.toFixed(1)}% on ${formatDateKey(latestDelivery.tradingDate)}${
                detail.deliveryAverage === null
                  ? ''
                  : ` · ${detail.delivery.length}-session average ${detail.deliveryAverage.toFixed(1)}%`
              }`
        }
      >
        <ReferenceBars
          points={detail.delivery.map((d) => ({ date: d.tradingDate, value: d.percent }))}
          reference={detail.deliveryAverage}
          format={(v) => `${v.toFixed(1)}% delivered`}
          label="Delivery percentage"
        />
        <Text as="p" variant="caption">
          Share of each session's traded quantity that was taken into demat rather than squared off
          intraday. Bars above the dashed average are the unusual sessions.
        </Text>
      </DrawerSection>

      <DrawerSection
        title="Futures open interest"
        detail={
          latestOi === null
            ? 'Not an F&O stock, or no sessions on file yet.'
            : `${contracts(latestOi.futuresOi)} on ${formatDateKey(latestOi.tradingDate)}`
        }
      >
        {detail.oi.length > 0 && (
          <>
            <Text as="p" variant="overline">
              Total open interest
            </Text>
            <TrendLine
              points={detail.oi.map((d) => ({ date: d.tradingDate, value: d.futuresOi }))}
              format={(v) => `OI ${contracts(v)}`}
              label="Total futures open interest"
              tone="neutral"
            />
            <Text as="p" variant="overline">
              Near-month futures close
            </Text>
            <TrendLine
              points={detail.oi.map((d) => ({ date: d.tradingDate, value: d.close }))}
              format={(v) => `Near-month close ${largeCurrency(v)}`}
              label="Near-month futures close"
            />
            <ul className="flex flex-wrap gap-1">
              {detail.oi
                .slice(-10)
                .reverse()
                .map((session) => (
                  <li key={session.tradingDate}>
                    <Badge
                      variant={session.buildup === null ? 'outline' : buildupTone(session.buildup)}
                      size="sm"
                      className="font-normal"
                    >
                      {formatDateKey(session.tradingDate).replace(/^\w+, /, '')}
                      {session.buildup === null ? '' : ` · ${BUILDUP_LABEL[session.buildup]}`}
                    </Badge>
                  </li>
                ))}
            </ul>
            <Text as="p" variant="caption">
              Open interest summed across the listed expiries, with the near-month close beneath it.
              Each session is labelled by how price and OI moved together.
            </Text>
          </>
        )}
      </DrawerSection>

      <DrawerSection
        title="Bulk & block deals"
        detail={
          detail.deals.length === 0
            ? 'No reported deals on file.'
            : `${detail.deals.length} on file, newest first`
        }
      >
        {detail.deals.length > 0 && (
          <ul className="divide-y divide-border">
            {detail.deals.map((deal) => (
              <li key={deal.id} className="flex flex-col gap-1 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm" title={deal.clientName}>
                    {deal.clientName}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <SideBadge side={deal.side} />
                    <DealTypeBadge dealType={deal.dealType} />
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{formatDateKey(deal.tradingDate)}</span>
                  <span className="figure">
                    <Currency paise={deal.value} className="font-medium" /> ·{' '}
                    <Quantity units={deal.quantity} /> @ <Price paise={deal.price} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>

      <DrawerSection
        title="Shareholding"
        detail={
          quarters.length === 0
            ? 'No quarters on file.'
            : `${quarters.length} quarters, oldest first`
        }
      >
        {quarters.length > 0 && (
          <>
            <ShareholdingBars quarters={quarters} />
            <ul className="flex flex-wrap gap-3">
              {SHARE_LEGEND.map((item) => {
                const latest = detail.shareholding.at(-1);
                const value =
                  latest === undefined
                    ? null
                    : item.id === 'promoter'
                      ? latest.promoterPercent
                      : item.id === 'fii'
                        ? latest.fiiPercent
                        : item.id === 'dii'
                          ? latest.diiPercent
                          : latest.publicPercent;
                return (
                  <li key={item.id} className="flex items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className={`inline-block size-2.5 rounded-sm ${item.swatch}`}
                    />
                    <span className="text-muted-foreground">{item.label}</span>
                    <Percent value={value} decimals={2} />
                  </li>
                );
              })}
            </ul>
            <Text as="p" variant="caption">
              Quarter-end ownership as filed. FII and DII splits show only when the exchange summary
              carries them.
            </Text>
          </>
        )}
      </DrawerSection>

      <div className="flex flex-wrap gap-3 border-t border-border pt-4 text-xs">
        <Link
          href={`/announcements?symbol=${encodeURIComponent(detail.symbol)}`}
          className="text-primary hover:underline"
        >
          Announcements for {detail.symbol}
        </Link>
      </div>
      <Text as="p" variant="micro">
        {detail.disclaimer}
      </Text>
    </>
  );
}

function DrawerSection({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <Text as="h3" variant="card-title">
          {title}
        </Text>
        <Text as="p" variant="caption">
          {detail}
        </Text>
      </div>
      {children}
    </section>
  );
}
