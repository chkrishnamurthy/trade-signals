'use client';

import { CheckIcon, MinusIcon, XIcon } from 'lucide-react';
import { DefinitionGrid, DefinitionRow } from '@/components/data-display/metric-card';
import { ErrorState, SkeletonRows } from '@/components/data-display/states';
import { IndicatorValue, PercentChange, Price, Ratio, Volume } from '@/components/market/numeric';
import { SignalStrength } from '@/components/market/signal';
import { StockIdentity } from '@/components/market/stock-identity';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Text } from '@/components/ui/typography';
import { price as formatPrice, istTime } from '@/lib/format';
import { toneOfSignal } from '@/lib/intraday-display';
import {
  CATEGORY_LABEL,
  type IntradayReasonDto,
  type IntradaySignalDto,
  isTerminalState,
  KIND_LABEL,
} from '@/lib/intraday-types';
import { toneText } from '@/lib/tone';
import { useSignalDetail } from '@/lib/use-intraday-signals';
import { cn } from '@/lib/utils';
import { SignalChart } from './signal-chart';
import { SignalTimeline } from './signal-timeline';
import {
  ActionBadge,
  KindBadge,
  LevelRow,
  QualityBadge,
  StateBadge,
  TimeframeBadge,
} from './vocabulary';

/**
 * The signal analysis drawer.
 *
 * Answers one question in as much depth as the stored evidence allows: WHY did
 * this trigger, and is it still valid? Everything here is read from what the
 * engine persisted — the factor breakdown, the individual observations, the
 * indicator snapshot, the timeline. Nothing is recomputed, because a
 * recomputation could disagree with the verdict on screen (CLAUDE.md hard
 * rule 8).
 *
 * A `Sheet` rather than a page, so the feed stays behind it and a user
 * comparing three setups does not lose their place. Radix supplies the focus
 * trap and Escape-to-close.
 */
export function SignalDetail({
  signal,
  open,
  onOpenChange,
}: {
  /** The list's copy, shown immediately while the full detail loads. */
  signal: IntradaySignalDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useSignalDetail(open && signal !== null ? signal.id : null);
  const resolved = detail.status === 'ready' ? detail.data : signal;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-3xl">
        {resolved === null ? (
          <SheetHeader>
            <SheetTitle>Signal</SheetTitle>
            <SheetDescription>Loading the analysis…</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader className="flex-col items-start gap-2">
              <div className="flex w-full items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle asChild>
                    <div>
                      <StockIdentity symbol={resolved.symbol} name={resolved.name} size="lg" />
                    </div>
                  </SheetTitle>
                  <SheetDescription className="mt-1">
                    {KIND_LABEL[resolved.kind]} · {resolved.strategy} ·{' '}
                    {resolved.sector ?? 'Sector unknown'}
                  </SheetDescription>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <ActionBadge direction={resolved.direction} state={resolved.state} size="lg" />
                  <QualityBadge quality={resolved.quality} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StateBadge state={resolved.state} />
                <KindBadge kind={resolved.kind} />
                <TimeframeBadge signal={resolved} />
              </div>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-4">
              {detail.status === 'error' && (
                <ErrorState
                  title="Could not load the full analysis"
                  description="Showing what the feed already had."
                  detail={detail.error.error}
                />
              )}

              {isTerminalState(resolved.state) && resolved.endReason !== null && (
                <Alert variant="warning">
                  <AlertTitle>This setup is over</AlertTitle>
                  <AlertDescription>
                    {resolved.endReason}
                    {resolved.endedAt !== null && ` — ${istTime(resolved.endedAt)} IST.`} It is kept
                    visible so nothing disappears without an explanation.
                  </AlertDescription>
                </Alert>
              )}

              <SummaryBlock signal={resolved} />

              <Tabs defaultValue="why">
                <TabsList>
                  <TabsTrigger value="why">Why it triggered</TabsTrigger>
                  <TabsTrigger value="chart">Chart</TabsTrigger>
                  <TabsTrigger value="evidence">Technical detail</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="why" className="flex flex-col gap-4">
                  <ScoreBreakdown signal={resolved} />
                  <ReasonList reasons={resolved.reasons} />
                  <InvalidationList signal={resolved} />
                </TabsContent>

                <TabsContent value="chart">
                  <SignalChart signalId={resolved.id} />
                </TabsContent>

                <TabsContent value="evidence" className="flex flex-col gap-4">
                  <MultiTimeframe signal={resolved} />
                  <IndicatorBlock signal={resolved} />
                  <LevelBlock signal={resolved} />
                </TabsContent>

                <TabsContent value="timeline">
                  {detail.status === 'loading' ? (
                    <SkeletonRows rows={5} />
                  ) : (
                    <SignalTimeline events={resolved.timeline} />
                  )}
                </TabsContent>
              </Tabs>

              <p className="text-xs text-subtle-foreground">
                Every number on this page was recorded by the engine when the signal was scored.
                Nothing is recomputed here, so the explanation always matches the verdict. These are
                technical observations, not advice, and not a claim about profitability.
              </p>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SummaryBlock({ signal }: { signal: IntradaySignalDto }) {
  const tone = toneOfSignal(signal);
  const { indicators, levels } = signal;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Price paise={indicators.price} size="display" />
          <div className="mt-1">
            <PercentChange value={indicators.changePercent} />
          </div>
        </div>
        <div className="text-right">
          <span className={cn('figure text-2xl font-semibold', toneText({ tone }))}>
            {signal.score}
            <span className="text-sm font-normal text-subtle-foreground">/100</span>
          </span>
          <Text as="p" variant="caption">
            Technical setup strength
          </Text>
        </div>
      </div>
      <SignalStrength strength={signal.score} tone={tone} showValue={false} />

      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <LevelRow
          label="Technical entry zone"
          value={`${formatPrice(levels.entryLow)} – ${formatPrice(levels.entryHigh)}`}
          hint="Where the setup's premise still holds. Not an order price."
        />
        <LevelRow
          label="Invalidation level"
          value={formatPrice(levels.invalidation)}
          hint="A close through this proves the technical premise wrong."
        />
        <LevelRow label="Technical target 1" value={formatPrice(levels.target1)} />
        <LevelRow label="Technical target 2" value={formatPrice(levels.target2)} />
        <LevelRow
          label="Technical risk"
          value={formatPrice(levels.risk)}
          hint="Distance from the entry zone to the invalidation level."
        />
        <LevelRow
          label="Reward : risk"
          value={<Ratio value={levels.riskReward} suffix=":1" size="sm" />}
        />
      </div>

      {signal.triggeredAt !== null && (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-2 sm:grid-cols-4">
          <DefinitionRow
            layout="stacked"
            label="Triggered"
            value={`${istTime(signal.triggeredAt)} IST`}
          />
          <DefinitionRow
            layout="stacked"
            label="Last validated"
            value={`${istTime(signal.updatedAt)} IST`}
          />
          <DefinitionRow
            layout="stacked"
            label="Best excursion"
            value={<Price paise={signal.maxFavourable} bare size="sm" />}
          />
          <DefinitionRow
            layout="stacked"
            label="Worst excursion"
            value={<Price paise={signal.maxAdverse} bare size="sm" />}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The score, decomposed.
 *
 * A confluence score is only meaningful if the categories are visible: 84 out
 * of 100 says nothing, whereas "trend 18/20, volume 4/15" says the setup is
 * riding a strong trend on thin participation, which is a different trade.
 */
function ScoreBreakdown({ signal }: { signal: IntradaySignalDto }) {
  const ordered = [...signal.factors].sort((a, b) => b.weight - a.weight);
  if (ordered.length === 0) {
    return <Text variant="caption">No score breakdown was recorded for this signal.</Text>;
  }

  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="section-title">
        Score breakdown
      </Text>
      <ul className="flex flex-col gap-2">
        {ordered.map((factor) => (
          <li key={factor.category} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium">{CATEGORY_LABEL[factor.category]}</span>
              <span className="figure text-xs text-muted-foreground">
                {factor.points.toFixed(1)} / {factor.weight.toFixed(0)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, Math.min(100, factor.score * 100))}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{factor.detail}</span>
          </li>
        ))}
      </ul>

      <ScoreArithmetic signal={signal} />
    </section>
  );
}

/**
 * The rest of the calculation, so the breakdown actually adds up.
 *
 * The categories total more than the published score, because conviction
 * scales the result and the session regime deducts a flat penalty. Showing the
 * categories alone would leave the reader with two numbers that visibly
 * disagree and no way to reconcile them — which is precisely what a score
 * breakdown exists to prevent.
 */
function ScoreArithmetic({ signal }: { signal: IntradaySignalDto }) {
  const { scoring } = signal;
  if (scoring === null) return null;

  const scaled = scoring.categoryPoints * (0.65 + 0.35 * scoring.conviction);
  return (
    <dl className="flex flex-col gap-1 border-t border-border pt-2">
      <Row
        label="Category total"
        value={`${scoring.categoryPoints.toFixed(1)} / ${scoring.maxPoints.toFixed(0)}`}
      />
      <Row
        label={`Strategy conviction ×${(0.65 + 0.35 * scoring.conviction).toFixed(2)}`}
        value={scaled.toFixed(1)}
        hint="How completely this strategy's own preconditions were met. A partly-formed setup cannot reach the same score as a fully-formed one, however good the surrounding context looks."
      />
      {scoring.regimePenalty > 0 && (
        <Row
          label={`${signal.regime.replace('_', ' ')} session penalty`}
          value={`−${scoring.regimePenalty.toFixed(0)}`}
          hint="Some parts of the session have a worse base rate for intraday setups, so the same technical picture has to be better to surface."
        />
      )}
      <Row label="Setup score" value={`${scoring.score} / 100`} strong />
    </dl>
  );
}

function Row({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  strong?: boolean;
}) {
  const row = (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3',
        strong && 'border-t border-border pt-1',
      )}
    >
      <dt
        className={cn('text-xs', strong ? 'font-medium text-foreground' : 'text-muted-foreground')}
      >
        {label}
      </dt>
      <dd className={cn('figure text-xs', strong && 'font-semibold')}>{value}</dd>
    </div>
  );
  if (hint === undefined) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The individual observations, including the ones against.
 *
 * Opposing evidence is shown, not hidden. A setup that scored 82 despite the
 * higher timeframe leaning the other way is a different proposition from one
 * that scored 82 with everything agreeing, and only one of them looks like a
 * good idea once you can see it.
 */
function ReasonList({ reasons }: { reasons: readonly IntradayReasonDto[] }) {
  if (reasons.length === 0) return null;

  const icon = (polarity: IntradayReasonDto['polarity']) => {
    if (polarity === 'supporting') return <CheckIcon className="size-3 text-bullish-strong" />;
    if (polarity === 'opposing') return <XIcon className="size-3 text-bearish-strong" />;
    return <MinusIcon className="size-3 text-subtle-foreground" />;
  };

  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="section-title">
        Evidence
      </Text>
      <ul className="flex flex-col gap-1.5">
        {reasons.map((reason) => (
          <li key={reason.key} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {icon(reason.polarity)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium">{reason.label}</span>
              <span className="block text-xs text-muted-foreground">{reason.detail}</span>
            </span>
            <span className="shrink-0 text-[0.6875rem] text-subtle-foreground">
              {CATEGORY_LABEL[reason.category]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The conditions that would end the setup, exactly as stored. */
function InvalidationList({ signal }: { signal: IntradaySignalDto }) {
  if (signal.invalidations.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="section-title">
        Invalidation conditions
      </Text>
      <ul className="flex flex-col gap-1">
        {signal.invalidations.map((rule) => (
          <li
            key={`${rule.kind}-${rule.level ?? rule.label}`}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="min-w-0 text-xs text-foreground">{rule.label}</span>
            {rule.level !== null && (
              <span className="figure shrink-0 text-xs font-medium">{formatPrice(rule.level)}</span>
            )}
          </li>
        ))}
      </ul>
      <Text variant="caption">
        These are checked on every engine pass, on a closing basis. When one fires the signal moves
        to Invalidated and stops being shown as a live setup.
      </Text>
    </section>
  );
}

function MultiTimeframe({ signal }: { signal: IntradaySignalDto }) {
  const { trends } = signal.indicators;
  if (trends.length === 0) return null;

  const role = (minutes: number): string => {
    if (minutes === signal.trendMinutes) return 'Trend';
    if (minutes === signal.setupMinutes) return 'Setup';
    if (minutes === signal.triggerMinutes) return 'Trigger';
    return '';
  };

  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="section-title">
        Multi-timeframe read
      </Text>
      <ul className="flex flex-col gap-1.5">
        {trends.map((trend) => (
          <li key={trend.minutes} className="flex items-start gap-2">
            <span className="figure w-14 shrink-0 font-mono text-xs text-muted-foreground">
              {trend.minutes}m
            </span>
            <span className="w-14 shrink-0 text-xs text-subtle-foreground">
              {role(trend.minutes)}
            </span>
            <span
              className={cn(
                'w-16 shrink-0 text-xs font-medium',
                toneText({
                  tone:
                    trend.direction === 'long'
                      ? 'bullish'
                      : trend.direction === 'short'
                        ? 'bearish'
                        : 'neutral',
                }),
              )}
            >
              {trend.direction === 'flat'
                ? 'Flat'
                : trend.direction === 'long'
                  ? 'Bullish'
                  : 'Bearish'}
            </span>
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">{trend.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IndicatorBlock({ signal }: { signal: IntradaySignalDto }) {
  const i = signal.indicators;
  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="section-title">
        Indicator snapshot at detection
      </Text>
      <DefinitionGrid columns={2}>
        <DefinitionRow label="VWAP" value={<Price paise={i.vwap} bare size="sm" />} />
        <DefinitionRow
          label="Distance from VWAP"
          value={<PercentChange value={i.vwapDistancePercent} size="sm" showGlyph={false} />}
        />
        <DefinitionRow label="RSI" value={<IndicatorValue value={i.rsi} />} />
        <DefinitionRow label="ADX" value={<IndicatorValue value={i.adx} decimals={0} />} />
        <DefinitionRow
          label="ATR"
          value={
            <span className="figure text-sm">
              <Price paise={i.atr} bare size="sm" />{' '}
              <span className="text-xs text-muted-foreground">
                ({i.atrPercent === null ? '—' : `${i.atrPercent.toFixed(2)}%`})
              </span>
            </span>
          }
        />
        <DefinitionRow
          label="MACD histogram"
          value={<Price paise={i.macdHistogram} bare size="sm" />}
        />
        <DefinitionRow
          label="Relative volume"
          value={<Ratio value={i.relativeVolume} size="sm" />}
        />
        <DefinitionRow
          label="Trigger-bar volume"
          value={<Ratio value={i.barRelativeVolume} size="sm" />}
        />
        <DefinitionRow label="EMA 9" value={<Price paise={i.ema9} bare size="sm" />} />
        <DefinitionRow label="EMA 20" value={<Price paise={i.ema20} bare size="sm" />} />
        <DefinitionRow
          label="Gap from previous close"
          value={<PercentChange value={i.gapPercent} size="sm" showGlyph={false} />}
        />
        <DefinitionRow
          label="Session volume"
          value={<Volume shares={i.sessionVolume} size="sm" />}
        />
      </DefinitionGrid>
      <Text variant="caption">
        Relative volume compares against what this symbol normally trades at this minute of the
        session, not against a full-day average.
      </Text>
    </section>
  );
}

function LevelBlock({ signal }: { signal: IntradaySignalDto }) {
  const { levels, dayHigh, dayLow, dayOpen, previousClose, previousHigh, previousLow } =
    signal.indicators;

  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="section-title">
        Support and resistance
      </Text>
      <DefinitionGrid columns={2}>
        <DefinitionRow
          label="Previous day high"
          value={<Price paise={previousHigh} bare size="sm" />}
        />
        <DefinitionRow
          label="Previous day low"
          value={<Price paise={previousLow} bare size="sm" />}
        />
        <DefinitionRow
          label="Previous close"
          value={<Price paise={previousClose} bare size="sm" />}
        />
        <DefinitionRow label="Day open" value={<Price paise={dayOpen} bare size="sm" />} />
        <DefinitionRow label="Day high" value={<Price paise={dayHigh} bare size="sm" />} />
        <DefinitionRow label="Day low" value={<Price paise={dayLow} bare size="sm" />} />
      </DefinitionGrid>

      {levels.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {levels.map((level) => (
            <li key={level.key} className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">{level.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-[0.6875rem] text-subtle-foreground">{level.kind}</span>
                <span className="figure text-xs font-medium">{formatPrice(level.price)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
