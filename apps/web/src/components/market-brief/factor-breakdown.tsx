'use client';

import { HelpCircleIcon } from 'lucide-react';
import { SignalReason } from '@/components/market/signal';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/typography';
import type { AttentionFactorDto, BriefSignalFactor } from '@/lib/market-brief';

/**
 * The "Why?" control.
 *
 * Reads persisted signal factors and, for an attention item, the deterministic
 * attention factors that ranked it — never a recomputed explanation (CLAUDE.md
 * hard rule 8). Every point of an attention score is itemised here, so no
 * number appears on the page that this panel cannot account for.
 */
export function FactorBreakdown({
  title,
  attentionFactors,
  attentionTotal,
  signalFactors,
}: {
  title: string;
  attentionFactors?: readonly AttentionFactorDto[] | undefined;
  attentionTotal?: number | undefined;
  signalFactors: readonly BriefSignalFactor[];
}) {
  const hasAttention = attentionFactors !== undefined && attentionFactors.length > 0;
  const hasSignals = signalFactors.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          aria-label={`Why is ${title} shown?`}
        >
          <HelpCircleIcon aria-hidden />
          Why?
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
        <Text as="h3" variant="label" className="mb-2 block">
          {title}
        </Text>

        {hasAttention && (
          <section className="mb-3">
            <div className="mb-1 flex items-baseline justify-between">
              <Text variant="overline">Attention factors</Text>
              {attentionTotal !== undefined && (
                <span className="figure text-xs text-muted-foreground">{attentionTotal} pts</span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {attentionFactors?.map((factor) => (
                <li key={factor.id} className="flex items-start gap-2 text-xs">
                  <span className="figure w-7 shrink-0 text-right font-medium text-foreground">
                    +{factor.contribution}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{factor.label}</span>
                    <span className="block text-muted-foreground">{factor.explanation}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasSignals ? (
          <section>
            <Text variant="overline" className="mb-1 block">
              Signal factors
            </Text>
            <ul className="flex flex-col gap-1">
              {signalFactors.map((factor) => (
                <SignalReason
                  key={factor.key}
                  label={factor.label}
                  detail={factor.detail}
                  score={factor.score}
                />
              ))}
            </ul>
          </section>
        ) : (
          !hasAttention && (
            <Text variant="caption">No stored factor breakdown for this session.</Text>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
