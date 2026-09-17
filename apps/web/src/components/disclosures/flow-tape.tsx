'use client';

import { ChevronDownIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MetricCard } from '@/components/data-display/metric-card';
import { EmptyState } from '@/components/data-display/states';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/layout/page';
import { Currency } from '@/components/market/numeric';
import { Sparkline } from '@/components/market/sparkline';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Text } from '@/components/ui/typography';
import type { MarketTapeDto, ParticipantOiCellDto } from '@/lib/disclosure-types';
import { cumulativeSeries, netSeries } from '@/lib/flow-analytics';
import { BUCKET_LABEL, contracts, PARTICIPANT_LABEL, signedContracts } from '@/lib/flow-labels';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { FlowChart } from './flow-chart';
import { formatDateKey, NetValue, Segmented } from './parts';

/**
 * The market tape: where the big money stood at the last close, in three
 * tiles, one chart and one grid. Everything market-wide lives here so the
 * stock table below can be entirely per-name.
 */
export function MarketTape({ tape }: { tape: MarketTapeDto }) {
  const empty = tape.fiiCash === null && tape.diiCash === null && tape.fiiIndexFutures === null;

  return (
    <Section aria-labelledby="tape-heading">
      <SectionHeader>
        <SectionTitle id="tape-heading">Market tape</SectionTitle>
        <SectionDescription>
          Institutional cash flow and derivatives positioning, market-wide, at the last close
        </SectionDescription>
      </SectionHeader>

      {empty ? (
        <Card>
          <CardContent>
            <EmptyState
              title="No market-wide data yet"
              description="FII/DII and participant-wise figures are published after the close."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CashTile label="FII cash" summary={tape.fiiCash} />
          <CashTile label="DII cash" summary={tape.diiCash} />
          <FuturesTile position={tape.fiiIndexFutures} />
        </div>
      )}

      {tape.fiiDii.length > 0 && <FiiDiiCard history={tape.fiiDii} />}

      {tape.participantOi.length > 0 && tape.participantOiDate !== null && (
        <PositioningGrid cells={tape.participantOi} date={tape.participantOiDate} />
      )}
    </Section>
  );
}

function CashTile({ label, summary }: { label: string; summary: MarketTapeDto['fiiCash'] }) {
  if (summary === null) {
    return <MetricCard label={label} value={<Text variant="secondary">Not reported</Text>} />;
  }
  return (
    <MetricCard
      label={label}
      hint="Net cash-market buying (positive) or selling (negative) by this participant class, as published by the exchange."
      value={<NetValue paise={summary.net} className="text-xl font-semibold" />}
      change={
        <Text as="span" variant="caption">
          {formatDateKey(summary.tradingDate)}
        </Text>
      }
      aside={<Sparkline values={summary.series} />}
      footer={
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">5 sessions</dt>
            <dd>
              <NetValue paise={summary.sum5} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">20 sessions</dt>
            <dd>
              <NetValue paise={summary.sum20} />
            </dd>
          </div>
        </dl>
      }
    />
  );
}

function FuturesTile({ position }: { position: MarketTapeDto['fiiIndexFutures'] }) {
  if (position === null) {
    return (
      <MetricCard label="FII index futures" value={<Text variant="secondary">Not reported</Text>} />
    );
  }
  const tone = position.net > 0 ? 'bullish' : position.net < 0 ? 'bearish' : 'neutral';
  return (
    <MetricCard
      label="FII index futures"
      hint="Foreign institutions' open index-futures contracts, long minus short. Net short is a hedged or bearish book; the change is versus the previous session."
      value={
        <span className={cn('figure text-xl font-semibold', toneText({ tone }))}>
          {position.net > 0 ? 'Net long ' : position.net < 0 ? 'Net short ' : 'Flat '}
          {contracts(Math.abs(position.net))}
        </span>
      }
      change={
        <Text as="span" variant="caption">
          {position.netChange === null ? '' : `${signedContracts(position.netChange)} · `}
          {formatDateKey(position.tradingDate)}
        </Text>
      }
      aside={<Sparkline values={position.series} />}
      footer={
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Long</dt>
            <dd className="figure">{contracts(position.longContracts)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Short</dt>
            <dd className="figure">{contracts(position.shortContracts)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Long share</dt>
            <dd className="figure">{position.longPercent.toFixed(0)}%</dd>
          </div>
        </dl>
      }
    />
  );
}

function FiiDiiCard({ history }: { history: MarketTapeDto['fiiDii'] }) {
  const [participant, setParticipant] = useState<'fii' | 'dii'>('fii');
  const [mode, setMode] = useState<'bars' | 'line'>('bars');
  const [open, setOpen] = useState(false);

  const daily = useMemo(() => netSeries(history, participant), [history, participant]);
  const points = useMemo(() => (mode === 'line' ? cumulativeSeries(daily) : daily), [mode, daily]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text as="h3" variant="card-title">
            Cash-market net, last {history.length} {history.length === 1 ? 'session' : 'sessions'}
          </Text>
          <div className="flex flex-wrap gap-2">
            <Segmented
              ariaLabel="Participant"
              value={participant}
              onChange={setParticipant}
              options={[
                { id: 'fii', label: 'FII' },
                { id: 'dii', label: 'DII' },
              ]}
            />
            <Segmented
              ariaLabel="Chart mode"
              value={mode}
              onChange={setMode}
              options={[
                { id: 'bars', label: 'Daily' },
                { id: 'line', label: 'Cumulative' },
              ]}
            />
          </div>
        </div>
        <FlowChart
          points={points}
          mode={mode}
          seriesLabel={participant === 'fii' ? 'FII' : 'DII'}
        />
        <Text as="p" variant="caption">
          {mode === 'line'
            ? 'Running total of net buying over the window. Above the line is net accumulation.'
            : 'Each bar is one session’s net. Green is net buying, red is net selling.'}
        </Text>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 self-start text-muted-foreground text-xs hover:text-foreground"
        >
          <ChevronDownIcon className={cn('size-3 transition-transform', open && 'rotate-180')} />
          {open ? 'Hide sessions' : 'Show sessions'}
        </button>
        {open && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead className="text-right">FII bought</TableHead>
                  <TableHead className="text-right">FII sold</TableHead>
                  <TableHead className="text-right">FII net</TableHead>
                  <TableHead className="text-right">DII net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((day) => (
                  <TableRow key={day.tradingDate}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateKey(day.tradingDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {day.fii === null ? '—' : <Currency paise={day.fii.buy} />}
                    </TableCell>
                    <TableCell className="text-right">
                      {day.fii === null ? '—' : <Currency paise={day.fii.sell} />}
                    </TableCell>
                    <TableCell className="text-right">
                      {day.fii === null ? '—' : <NetValue paise={day.fii.net} />}
                    </TableCell>
                    <TableCell className="text-right">
                      {day.dii === null ? '—' : <NetValue paise={day.dii.net} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PARTICIPANT_ORDER = ['fii', 'dii', 'pro', 'client'] as const;
const BUCKET_ORDER = [
  'index_fut',
  'stock_fut',
  'index_ce',
  'index_pe',
  'stock_ce',
  'stock_pe',
] as const;

/** Net contracts per participant × bucket, with the session change underneath. */
function PositioningGrid({
  cells,
  date,
}: {
  cells: readonly ParticipantOiCellDto[];
  date: string;
}) {
  const byKey = new Map(cells.map((c) => [`${c.participant}:${c.bucket}`, c]));
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 px-0 py-4">
        <div className="px-4">
          <Text as="h3" variant="card-title">
            Derivatives positioning by participant
          </Text>
          <Text as="p" variant="caption">
            Net open contracts (long − short) at the close of {formatDateKey(date)}, with the change
            since the previous session.
          </Text>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bucket</TableHead>
                {PARTICIPANT_ORDER.map((p) => (
                  <TableHead key={p} className="text-right">
                    {PARTICIPANT_LABEL[p]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {BUCKET_ORDER.map((bucket) => (
                <TableRow key={bucket}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {BUCKET_LABEL[bucket]}
                  </TableCell>
                  {PARTICIPANT_ORDER.map((p) => {
                    const cell = byKey.get(`${p}:${bucket}`);
                    if (cell === undefined) {
                      return (
                        <TableCell key={p} className="text-right">
                          —
                        </TableCell>
                      );
                    }
                    const net = cell.longContracts - cell.shortContracts;
                    const tone = net > 0 ? 'bullish' : net < 0 ? 'bearish' : 'neutral';
                    return (
                      <TableCell key={p} className="text-right">
                        <span className={cn('figure block text-xs', toneText({ tone }))}>
                          {signedContracts(net)}
                        </span>
                        <span className="figure block text-2xs text-muted-foreground">
                          {cell.netChange === null ? '' : signedContracts(cell.netChange)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
