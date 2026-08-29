'use client';

import { ArrowRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PercentChange, Price, Ratio } from '@/components/market/numeric';
import { SignalStrength } from '@/components/market/signal';
import { StockIdentity } from '@/components/market/stock-identity';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { agoLabel, price as formatPrice, istTime } from '@/lib/format';
import { toneOfSignal } from '@/lib/intraday-display';
import { CATEGORY_LABEL, type IntradaySignalDto, isTerminalState } from '@/lib/intraday-types';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { ActionBadge, KindBadge, LevelRow, QualityBadge, StateBadge } from './vocabulary';

/**
 * The signal card.
 *
 * Composed entirely from the existing design system — Card, Badge, the
 * financial number components, the tone tokens. It introduces no colour, no
 * radius and no type size of its own.
 *
 * What the card must communicate, in scanning order: which stock, which
 * direction, how strong, why, at what levels, and how fresh. Everything below
 * the score is the evidence that earns it — a score without its breakdown does
 * not render at all (CLAUDE.md).
 *
 * A terminal signal keeps its shape but loses its colour and gains its reason
 * for ending. A card that simply disappeared would leave the user wondering
 * whether they missed something.
 */
export function SignalCard({
  signal,
  onOpen,
  className,
}: {
  signal: IntradaySignalDto;
  onOpen: (signal: IntradaySignalDto) => void;
  className?: string | undefined;
}) {
  const tone = toneOfSignal(signal);
  const spent = isTerminalState(signal.state);
  const { indicators, levels } = signal;

  // Read after mount: the server has no access to the reader's clock, and
  // rendering an age on the server produces a hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const stamp = signal.triggeredAt ?? signal.detectedAt;
  const topFactors = [...signal.factors].sort((a, b) => b.points - a.points).slice(0, 5);

  return (
    <Card className={cn(spent && 'opacity-70', className)}>
      <CardContent className="flex flex-col gap-3">
        {/* Identity and direction */}
        <div className="flex items-start justify-between gap-3">
          <StockIdentity symbol={signal.symbol} name={signal.name} size="lg" />
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ActionBadge direction={signal.direction} state={signal.state} size="lg" />
            <QualityBadge quality={signal.quality} />
          </div>
        </div>

        {/* Price and score */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <Price paise={indicators.price} size="xl" />
            <div className="mt-0.5">
              <PercentChange value={indicators.changePercent} size="sm" />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className={cn('figure text-lg font-semibold', toneText({ tone }))}>
              {signal.score}
              <span className="text-xs font-normal text-subtle-foreground">/100</span>
            </span>
            <Text as="p" variant="caption">
              Setup score
            </Text>
          </div>
        </div>

        <SignalStrength
          strength={signal.score}
          tone={tone}
          showValue={false}
          label={`${signal.quality} setup`}
        />

        {/* Classification */}
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={signal.kind} />
          <StateBadge state={signal.state} />
          {signal.sector !== null && (
            <span className="text-xs text-muted-foreground">{signal.sector}</span>
          )}
        </div>

        {/* The breakdown that earns the score */}
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {topFactors.map((factor) => (
            <div key={factor.category} className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-muted-foreground">{CATEGORY_LABEL[factor.category]}</dt>
              <dd className="figure text-xs font-medium">
                {Math.round(factor.points)}
                <span className="text-subtle-foreground">/{Math.round(factor.weight)}</span>
              </dd>
            </div>
          ))}
        </dl>

        {/* Technical levels — chart prices, never orders */}
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <LevelRow
            label="Technical entry zone"
            value={`${formatPrice(levels.entryLow)} – ${formatPrice(levels.entryHigh)}`}
            hint="The band over which the setup's premise still holds. Not an order price."
          />
          <LevelRow
            label="Invalidation level"
            value={formatPrice(levels.invalidation)}
            hint="A close through this means the technical premise is wrong."
          />
          <LevelRow label="Target 1" value={formatPrice(levels.target1)} />
          <LevelRow label="Target 2" value={formatPrice(levels.target2)} />
          <LevelRow
            label="Reward : risk"
            value={<Ratio value={levels.riskReward} suffix=":1" size="sm" />}
            hint="A property of the level structure, not a forecast."
          />
        </div>

        {/* Freshness and the way in */}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="min-w-0">
            <Text as="p" variant="caption" className="truncate">
              {signal.triggeredAt === null ? 'Detected' : 'Triggered'} {istTime(stamp)} IST
              {now !== null && ` · ${agoLabel(stamp, now)}`}
            </Text>
            {spent && signal.endReason !== null && (
              <Text as="p" variant="caption" className="truncate text-warning">
                {signal.endReason}
              </Text>
            )}
            {!spent && now !== null && (
              <Text as="p" variant="caption" className="truncate">
                Revalidated {agoLabel(signal.updatedAt, now)}
              </Text>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpen(signal)} className="shrink-0">
            View analysis
            <ArrowRightIcon />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The dense variant, for the compact list on wide screens.
 *
 * Same data, same vocabulary, one row. Financial columns are not equally
 * important, so the least important drop out below `md` rather than every
 * column shrinking until nothing is readable.
 */
export function SignalRow({
  signal,
  onOpen,
}: {
  signal: IntradaySignalDto;
  onOpen: (signal: IntradaySignalDto) => void;
}) {
  const tone = toneOfSignal(signal);
  const topReason = signal.reasons.find((reason) => reason.polarity === 'supporting');

  return (
    <button
      type="button"
      onClick={() => onOpen(signal)}
      className={cn(
        'flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent',
        isTerminalState(signal.state) && 'opacity-70',
      )}
    >
      <ActionBadge direction={signal.direction} state={signal.state} size="sm" />
      <StockIdentity
        symbol={signal.symbol}
        name={signal.name}
        size="sm"
        className="w-32 shrink-0"
      />
      <Price paise={signal.indicators.price} size="sm" bare className="w-20 shrink-0 text-right" />
      <PercentChange
        value={signal.indicators.changePercent}
        size="sm"
        className="w-20 shrink-0 justify-end"
      />
      <SignalStrength
        strength={signal.score}
        tone={tone}
        label={`${signal.quality} setup strength`}
        className="w-20 shrink-0"
      />
      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:inline">
        {topReason?.label ?? signal.strategy}
      </span>
      <span className="hidden shrink-0 lg:inline">
        <StateBadge state={signal.state} />
      </span>
    </button>
  );
}
