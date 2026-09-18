import type { PaperOpenTrade } from '@equitywise/shared';
import { Badge } from '@/components/ui/badge';
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
import { day, price, rowNet, signed, time, timesRisked, tradeStatus } from './format';

export const Money = ({ v }: { v: number | null }) => (
  <span
    className={cn(
      'tabular-nums font-medium',
      v === null ? '' : v > 0 ? 'text-positive-strong' : v < 0 ? 'text-negative-strong' : '',
    )}
  >
    {signed(v)}
  </span>
);

function Exits({ t }: { t: PaperOpenTrade }) {
  const exits = t.projection.exits;
  if (exits.length === 0)
    return (
      <span className="text-muted-foreground">
        {t.projection.remainingShares > 0 ? `${t.projection.remainingShares} open` : '—'}
      </span>
    );
  return (
    <span className="tabular-nums">
      {exits.map((x) => (
        <span key={`${x.at}-${x.reason}`} className="block">
          {time(x.at)} · {price(x.price)} × {x.shares}
        </span>
      ))}
      {t.projection.remainingShares > 0 ? (
        <span className="block text-muted-foreground">
          {t.projection.remainingShares} still open
        </span>
      ) : null}
    </span>
  );
}

/**
 * One table for open and closed paper trades, ≥ md; stacked cards below. Column
 * names are technical levels and simulated shares — never order words.
 */
export function TradesTable({
  trades,
  showDate = false,
  emptyText,
}: {
  trades: readonly PaperOpenTrade[];
  showDate?: boolean;
  emptyText: string;
}) {
  if (trades.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <>
      <TableContainer className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {showDate ? <TableHead>Date</TableHead> : null}
              <TableHead>Stock</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Entry (simulated)</TableHead>
              <TableHead className="text-right">Stop / Target 1 / Target 2</TableHead>
              <TableHead>Exits</TableHead>
              <TableHead className="text-right">Last</TableHead>
              <TableHead className="text-right">Result (net)</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((t) => {
              const st = tradeStatus(t);
              const net = rowNet(t);
              return (
                <TableRow key={t.id}>
                  {showDate ? (
                    <TableCell className="tabular-nums">{day(t.openedAt ?? t.closedAt)}</TableCell>
                  ) : null}
                  <TableCell className="font-semibold">
                    {t.symbol}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t.strategyId} · v{t.strategyVersionId}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.direction === 'BUY' ? 'bullish' : 'bearish'}>
                      {t.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {t.projection.fill === null
                      ? `${t.decidedShares} shares planned near ${price(t.levels.reference)}`
                      : `${time(t.projection.fillAt)} · ${price(t.projection.fill)} × ${t.projection.shares}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {price(t.projection.effectiveStop ?? t.levels.stop)} / {price(t.levels.target1)}{' '}
                    / {price(t.levels.target2)}
                  </TableCell>
                  <TableCell>
                    <Exits t={t} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{price(t.lastPrice)}</TableCell>
                  <TableCell className="text-right">
                    <Money v={net} />
                    {timesRisked(net, t.initialRiskPaise) ? (
                      <span className="block text-xs text-muted-foreground">
                        {timesRisked(net, t.initialRiskPaise)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={st.tone}>{st.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <ul className="space-y-3 md:hidden">
        {trades.map((t) => {
          const st = tradeStatus(t);
          const net = rowNet(t);
          return (
            <li key={t.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {t.symbol}{' '}
                  <Badge variant={t.direction === 'BUY' ? 'bullish' : 'bearish'}>
                    {t.direction}
                  </Badge>
                </span>
                <Badge variant={st.tone}>{st.label}</Badge>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Entry (simulated)</dt>
                <dd className="tabular-nums">
                  {t.projection.fill === null
                    ? 'waiting'
                    : `${price(t.projection.fill)} × ${t.projection.shares}`}
                </dd>
                <dt className="text-muted-foreground">Stop level</dt>
                <dd className="tabular-nums">
                  {price(t.projection.effectiveStop ?? t.levels.stop)}
                </dd>
                <dt className="text-muted-foreground">Targets</dt>
                <dd className="tabular-nums">
                  {price(t.levels.target1)} / {price(t.levels.target2)}
                </dd>
                <dt className="text-muted-foreground">Last</dt>
                <dd className="tabular-nums">{price(t.lastPrice)}</dd>
                <dt className="text-muted-foreground">Result (net)</dt>
                <dd>
                  <Money v={net} />
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}
