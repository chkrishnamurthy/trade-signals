import type { IntradaySignalDto, IntradayToday } from '@equitywise/shared';
import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { isNew, notTakenLabel, price, statusOf, time } from './format';

function Direction({ d }: { d: 'BUY' | 'SELL' }) {
  return (
    <Badge variant={d === 'BUY' ? 'bullish' : 'bearish'} className="gap-0.5 font-semibold">
      {d === 'BUY' ? (
        <ArrowUpRightIcon className="size-3" aria-hidden />
      ) : (
        <ArrowDownRightIcon className="size-3" aria-hidden />
      )}
      {d}
    </Badge>
  );
}
function Status({ s, serverNow }: { s: IntradaySignalDto; serverNow: number }) {
  const st = statusOf(s);
  const notTaken = notTakenLabel(s);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {isNew(s, serverNow) ? (
        <Badge variant="default" size="sm">
          New
        </Badge>
      ) : null}
      <Badge variant={st.tone}>{st.label}</Badge>
      {notTaken ? <span className="text-xs text-muted-foreground">{notTaken}</span> : null}
      {s.projection.status === 'SKIPPED' && s.projection.skipReason === 'ENTRY_SLIPPED' ? (
        <span className="text-xs text-muted-foreground">entry slipped</span>
      ) : null}
    </span>
  );
}
/** Entry level is the signal close; once filled, the simulated fill sits beside it. */
function Entry({ s }: { s: IntradaySignalDto }) {
  const p = s.projection;
  return (
    <span className="tabular-nums">
      {price(s.evidence.levels.ref)}
      {p.fill !== null ? (
        <span className="block text-xs text-muted-foreground">filled {price(p.fill)}</span>
      ) : null}
    </span>
  );
}
function Stop({ s }: { s: IntradaySignalDto }) {
  const { stop } = s.evidence.levels;
  const eff = s.projection.effectiveStop;
  return (
    <span className="tabular-nums">
      {price(stop)}
      {eff !== null && eff !== stop ? (
        <span className="block text-xs text-muted-foreground">now {price(eff)} (breakeven)</span>
      ) : null}
    </span>
  );
}
const Hit = ({ hit }: { hit: boolean }) =>
  hit ? (
    <span className="ml-1 text-bullish-strong" title="reached">
      <span className="sr-only">reached</span>✓
    </span>
  ) : null;

function SummaryStrip({ signals }: { signals: readonly IntradaySignalDto[] }) {
  const count = (f: (s: IntradaySignalDto) => boolean) => signals.filter(f).length;
  const items: [string, number][] = [
    ['Pending', count((s) => s.projection.status === 'PENDING')],
    ['Active', count((s) => s.projection.status === 'ACTIVE')],
    ['Target 1', count((s) => s.projection.status === 'TARGET_1_HIT')],
    ['Target 2', count((s) => s.projection.status === 'TARGET_2_HIT')],
    ['Stopped', count((s) => s.projection.status === 'STOPPED_OUT')],
    ['Closed EOD', count((s) => s.projection.status === 'CLOSED_EOD')],
    ['Skipped', count((s) => s.projection.status === 'SKIPPED' || !s.projection.taken)],
  ];
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-1">
          <dt>{k}</dt>
          <dd className="font-semibold tabular-nums text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SignalsCard({ data }: { data: IntradayToday }) {
  const { signals, serverNow, phase } = data;
  const empty =
    phase === 'PRE_OPEN' || phase === 'CLOSED'
      ? signals.length === 0
        ? 'No signals for this session.'
        : null
      : phase === 'OPENING_RANGE'
        ? 'Opening range forming — signals start at 09:35.'
        : signals.length === 0
          ? 'No signals yet today.'
          : null;
  return (
    <Card aria-labelledby="signals-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="signals-title">Signals</CardTitle>
          <CardDescription>
            Every signal the strategy fired today. Levels are technical price levels; shares are
            simulated.
          </CardDescription>
        </CardHeading>
        <CardToolbar>
          <SummaryStrip signals={signals} />
        </CardToolbar>
      </CardHeader>
      <CardContent className="p-0">
        {empty ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <>
            <TableContainer className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Entry level</TableHead>
                    <TableHead className="text-right">Stop level</TableHead>
                    <TableHead className="text-right">Target 1</TableHead>
                    <TableHead className="text-right">Target 2</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signals.map((s) => (
                    <TableRow key={s.id} className={cn(isNew(s, serverNow) && 'bg-primary/5')}>
                      <TableCell>
                        <span className="font-semibold">{s.symbol}</span>
                        <span className="block max-w-[14rem] truncate text-xs text-muted-foreground">
                          {s.companyName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Direction d={s.evidence.direction} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Entry s={s} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Stop s={s} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {price(s.evidence.levels.target1)}
                        <Hit hit={s.projection.target1At !== null} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {price(s.evidence.levels.target2)}
                        <Hit hit={s.projection.status === 'TARGET_2_HIT'} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {price(s.lastPrice)}
                      </TableCell>
                      <TableCell>
                        <Status s={s} serverNow={serverNow} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {time(s.publishedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <ul className="divide-y divide-border md:hidden">
              {signals.map((s) => (
                <li
                  key={s.id}
                  className={cn('space-y-2 px-4 py-3', isNew(s, serverNow) && 'bg-primary/5')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold">{s.symbol}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {time(s.publishedAt)}
                      </span>
                    </div>
                    <Direction d={s.evidence.direction} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Entry level</dt>
                    <dd className="text-right">
                      <Entry s={s} />
                    </dd>
                    <dt className="text-muted-foreground">Stop level</dt>
                    <dd className="text-right">
                      <Stop s={s} />
                    </dd>
                    <dt className="text-muted-foreground">Target 1</dt>
                    <dd className="text-right tabular-nums">
                      {price(s.evidence.levels.target1)}
                      <Hit hit={s.projection.target1At !== null} />
                    </dd>
                    <dt className="text-muted-foreground">Target 2</dt>
                    <dd className="text-right tabular-nums">
                      {price(s.evidence.levels.target2)}
                      <Hit hit={s.projection.status === 'TARGET_2_HIT'} />
                    </dd>
                    <dt className="text-muted-foreground">Current</dt>
                    <dd className="text-right tabular-nums">{price(s.lastPrice)}</dd>
                  </dl>
                  <Status s={s} serverNow={serverNow} />
                </li>
              ))}
            </ul>
          </>
        )}
        {data.exclusions.length > 0 ? (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            No signal today for {data.exclusions.length} stock
            {data.exclusions.length === 1 ? '' : 's'}:{' '}
            {data.exclusions
              .map((e) => `${e.symbol} (${e.reason.toLowerCase().replaceAll('_', ' ')})`)
              .join(', ')}
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
