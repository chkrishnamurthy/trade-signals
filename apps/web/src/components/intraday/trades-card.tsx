import type { IntradaySignalDto, IntradayToday } from '@equitywise/shared';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { exitSummary, percent, price, signed, statusOf, time, timesRisked } from './format';

const deployed = (s: IntradaySignalDto) =>
  s.projection.fill === null ? null : s.projection.fill * s.projection.shares;
const result = (s: IntradaySignalDto) =>
  s.projection.endedAt === null ? s.markNetPaise : s.realisedNetPaise;
const Money = ({ v }: { v: number | null }) => (
  <span
    className={cn(
      'tabular-nums font-medium',
      v === null ? '' : v > 0 ? 'text-positive-strong' : v < 0 ? 'text-negative-strong' : '',
    )}
  >
    {signed(v)}
  </span>
);
function Exits({ s }: { s: IntradaySignalDto }) {
  if (s.projection.exits.length === 0) return <span className="text-muted-foreground">open</span>;
  return (
    <span className="tabular-nums">
      {s.projection.exits.map((x) => (
        <span key={`${x.at}-${x.reason}`} className="block">
          {time(x.at)} · {price(x.price)} × {x.shares}
        </span>
      ))}
    </span>
  );
}

/** The paper book: only signals the book took, with simulated results. */
export function TradesCard({ data }: { data: IntradayToday }) {
  const trades = data.signals
    .filter((s) => s.projection.taken && s.projection.fill !== null)
    .sort((a, b) => (a.projection.fillAt ?? 0) - (b.projection.fillAt ?? 0));
  const { book } = data;
  const net = book.markNetPaise ?? book.realisedNetPaise;
  const risked = trades.reduce((sum, s) => sum + (s.initialRiskPaise ?? 0), 0);
  const wins = trades.filter((s) => (result(s) ?? 0) > 0).length;
  const losses = trades.filter((s) => (result(s) ?? 0) < 0).length;
  return (
    <Card aria-labelledby="trades-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="trades-title">Today&apos;s paper trades</CardTitle>
          <CardDescription>
            Simulated on {price(book.capitalPaise)} · {book.tradesToday}/{book.maxTradesPerDay}{' '}
            trades · {book.openTrades} open
            {book.lossHalted ? ' · daily loss halt reached' : ''}
          </CardDescription>
        </CardHeading>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Net today (simulated)</div>
          <div className="text-lg">
            <Money v={net} />
          </div>
          {timesRisked(net, risked) ? (
            <div className="text-xs text-muted-foreground">{timesRisked(net, risked)}</div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {trades.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No paper trades yet today.
          </p>
        ) : (
          <>
            <TableContainer className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead className="text-right">Stop / T1 / T2</TableHead>
                    <TableHead>Exits</TableHead>
                    <TableHead className="text-right">Result ₹</TableHead>
                    <TableHead className="text-right">Result %</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((s) => {
                    const st = statusOf(s);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-semibold">{s.symbol}</TableCell>
                        <TableCell>
                          <Badge variant={s.evidence.direction === 'BUY' ? 'bullish' : 'bearish'}>
                            {s.evidence.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {time(s.projection.fillAt)} · {price(s.projection.fill)} ×{' '}
                          {s.projection.shares}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {price(s.evidence.levels.stop)} / {price(s.evidence.levels.target1)} /{' '}
                          {price(s.evidence.levels.target2)}
                        </TableCell>
                        <TableCell>
                          <Exits s={s} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money v={result(s)} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {percent(result(s), deployed(s))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={st.tone}>
                            {s.projection.endedAt === null ? st.label : exitSummary(s)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5}>
                      {trades.length} trade{trades.length === 1 ? '' : 's'} · {wins} won · {losses}{' '}
                      lost
                    </TableCell>
                    <TableCell className="text-right">
                      <Money v={net} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {percent(net, book.capitalPaise)} of capital
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
            <ul className="divide-y divide-border md:hidden">
              {trades.map((s) => {
                const st = statusOf(s);
                return (
                  <li key={s.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{s.symbol}</span>
                      <Badge variant={s.evidence.direction === 'BUY' ? 'bullish' : 'bearish'}>
                        {s.evidence.direction}
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Entry</dt>
                      <dd className="text-right tabular-nums">
                        {time(s.projection.fillAt)} · {price(s.projection.fill)} ×{' '}
                        {s.projection.shares}
                      </dd>
                      <dt className="text-muted-foreground">Stop / T1 / T2</dt>
                      <dd className="text-right tabular-nums">
                        {price(s.evidence.levels.stop)} / {price(s.evidence.levels.target1)} /{' '}
                        {price(s.evidence.levels.target2)}
                      </dd>
                      <dt className="text-muted-foreground">Exits</dt>
                      <dd className="text-right">
                        <Exits s={s} />
                      </dd>
                      <dt className="text-muted-foreground">Result</dt>
                      <dd className="text-right">
                        <Money v={result(s)} />{' '}
                        <span className="text-xs text-muted-foreground">
                          {percent(result(s), deployed(s))}
                        </span>
                      </dd>
                    </dl>
                    <Badge variant={st.tone}>
                      {s.projection.endedAt === null ? st.label : exitSummary(s)}
                    </Badge>
                  </li>
                );
              })}
              <li className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {trades.length} trades · {wins} won · {losses} lost
                </span>
                <Money v={net} />
              </li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
